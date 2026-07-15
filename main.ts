import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { parse } from "yaml";
import { bootstrapCompany } from "./src/agent.js";
import { diff, loadSnapshot, saveSnapshot } from "./src/differ.js";
import { sendAlert, sendBrief } from "./src/notifier.js";
import { loadRecipes, scrapeCompany } from "./src/scraper.js";
import type { Posting, Recipe } from "./src/types.js";

if (existsSync(".env")) process.loadEnvFile(".env");

interface Company {
  name: string;
  url: string;
}

async function loadCompanies(): Promise<Company[]> {
  return parse(await readFile("config/companies.yaml", "utf8")).companies;
}

function keywordRegexes(keywords: string[]): RegExp[] {
  // All caps keywords (ML, AI) match case-sensitively so "html" doesn't fire.
  return keywords.map((k) => {
    const escaped = k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`\\b${escaped}\\b`, k === k.toUpperCase() ? "" : "i");
  });
}

async function isPriority(): Promise<(p: Posting) => boolean> {
  const raw = parse(await readFile("config/priorities.yaml", "utf8"));
  const companies = new Set<string>(raw.priority_companies ?? []);
  const regexes = keywordRegexes(raw.priority_keywords ?? []);
  return (p) => companies.has(p.company) && regexes.some((re) => re.test(p.title));
}

// Only track intern/co-op roles for now, edit regex to change the scope later.
// (\b after "op" keeps "co-op"/"coop" from matching "cooperative".)
const RELEVANT_TITLE = /\bintern(ship)?s?\b|\bco-?op\b|\bstudent\b/i;

async function monitorCompany(
  company: Company,
  recipe: Recipe | undefined
): Promise<{ fresh: Posting[]; warning?: string }> {
  if (!recipe) recipe = await bootstrapCompany(company.name, company.url);

  let current: Posting[];
  try {
    current = await scrapeCompany(company.name, recipe);
    // A previously-working recipe now returning nothing means it likely broke,
    // not that every job vanished, re-bootstrap and retry once.
    if (current.length === 0) throw new Error("recipe returned 0 postings");
  } catch (err) {
    recipe = await bootstrapCompany(company.name, company.url);
    current = await scrapeCompany(company.name, recipe);
  }

  // Filter AFTER the empty-board health check above: a board full of senior
  // roles and zero intern roles is healthy, not broken.
  current = current.filter((p) => RELEVANT_TITLE.test(p.title));

  const previous = await loadSnapshot(company.name);
  await saveSnapshot(company.name, current);
  if (previous === null) {
    return { fresh: [], warning: `${company.name}: first run, baseline saved (${current.length} postings)` };
  }
  return { fresh: diff(current, previous) };
}

async function monitor(): Promise<void> {
  const [companies, recipes, priority] = await Promise.all([
    loadCompanies(),
    loadRecipes(),
    isPriority(),
  ]);

  const allFresh: Posting[] = [];
  const warnings: string[] = [];

  // Concurrency-limited: batches of 5.
  for (let i = 0; i < companies.length; i += 5) {
    await Promise.all(
      companies.slice(i, i + 5).map(async (company) => {
        try {
          const { fresh, warning } = await monitorCompany(company, recipes[company.name]);
          allFresh.push(...fresh);
          if (warning) warnings.push(warning);
        } catch (err) {
          warnings.push(`${company.name}: FAILED — ${err instanceof Error ? err.message : err}`);
        }
      })
    );
  }

  for (const posting of allFresh.filter(priority)) {
    await sendAlert(posting);
  }
  await sendBrief(allFresh);
  for (const w of warnings) console.warn(`⚠️ ${w}`);
}

async function bootstrap(name?: string): Promise<void> {
  const companies = await loadCompanies();
  const recipes = await loadRecipes();
  const targets = name
    ? companies.filter((c) => c.name === name)
    : companies.filter((c) => !recipes[c.name]);
  if (name && targets.length === 0) throw new Error(`${name} not found in companies.yaml`);

  for (const c of targets) {
    try {
      const recipe = await bootstrapCompany(c.name, c.url);
      console.log(`✅ ${c.name}: ${JSON.stringify(recipe)}`);
    } catch (err) {
      console.error(`❌ ${c.name}: ${err instanceof Error ? err.message : err}`);
    }
  }
}

const [mode, arg] = process.argv.slice(2);
if (mode === "--bootstrap") await bootstrap(arg);
else if (mode === "--monitor") await monitor();
else {
  console.error("Usage: tsx main.ts --bootstrap [company] | --monitor");
  process.exit(1);
}
