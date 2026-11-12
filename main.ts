import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { parse } from "yaml";
import { bootstrapCompany } from "./src/agent.js";
import { diff, loadSnapshot, saveSnapshot } from "./src/differ.js";
import { sendAlert, sendBrief } from "./src/notifier.js";
import { pruneClosed, updateCompany, type TrackedPosting } from "./src/postings.js";
import { loadRecipes, scrapeCompany } from "./src/scraper.js";
import { RELEVANT_TITLE, type Posting, type Recipe } from "./src/types.js";

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

async function monitorCompany(
  company: Company,
  recipe: Recipe | undefined
): Promise<{ fresh: Posting[]; current: Posting[] | null; firstRun: boolean; warning?: string }> {
  // Companies with no recipe yet are NOT bootstrapped here
  // This is to avoid 30-min run re-attempts on every company that failed the process
  // Only a recipe that USED to work gets auto-healed below. 
  // Run `main.ts --bootstrap <company>` manually to add new ones.
  if (!recipe) {
    return { fresh: [], current: null, firstRun: false, warning: `${company.name}: no recipe yet, skipped (run --bootstrap)` };
  }

  // Workday recipes only fetch student roles, so 0 is normal there. scrapeWorkday throws itself if the board is gone.
  const looksBroken = (r: Recipe, postings: Posting[]) => postings.length === 0 && r.type !== "workday";

  let current: Posting[];
  let rebuilt = false;
  try {
    current = await scrapeCompany(company.name, recipe);
    // A previously-working recipe now returning nothing means it likely broke,
    // not that every job vanished, re-bootstrap and retry once.
    if (looksBroken(recipe, current)) throw new Error("recipe returned 0 postings");
  } catch (err) {
    recipe = await bootstrapCompany(company.name, company.url);
    current = await scrapeCompany(company.name, recipe);
    // Still empty after the retry: treat as broken so it can't close every posting.
    if (looksBroken(recipe, current)) throw new Error("recipe still returned 0 postings after re-bootstrap");
    rebuilt = true;
  }

  // Filter AFTER the empty-board health check above: a board full of senior
  // roles and zero intern roles is healthy, not broken.
  current = current.filter((p) => RELEVANT_TITLE.test(p.title));

  const previous = await loadSnapshot(company.name);
  await saveSnapshot(company.name, current);
  if (previous === null) {
    return { fresh: [], current, firstRun: true, warning: `${company.name}: first run, baseline saved (${current.length} postings)` };
  }
  // A rebuilt recipe can reach more of the board than the old one did (a browser-read Workday page only
  // shows page 1, its API shows all), so anything it finds this run counts as baseline, not new.
  if (rebuilt) {
    return { fresh: [], current, firstRun: true, warning: `${company.name}: recipe rebuilt, postings found this run saved as baseline` };
  }
  return { fresh: diff(current, previous), current, firstRun: false };
}

type CompanyStatus = "ok" | "broken" | "no-recipe";

const POSTINGS_FILE = "data/postings.json";
const COMPANIES_FILE = "data/companies.json";

// Loads data/postings.json. If it doesn't exist yet (one-time migration), seeds it from the
// snapshots on disk, all marked baseline since we don't know when those postings went up.
// Must run before any snapshot is overwritten this run.
async function loadHistory(companies: Company[], now: Date): Promise<TrackedPosting[]> {
  if (existsSync(POSTINGS_FILE)) return JSON.parse(await readFile(POSTINGS_FILE, "utf8"));
  let history: TrackedPosting[] = [];
  for (const c of companies) {
    const snapshot = await loadSnapshot(c.name);
    if (snapshot) history = updateCompany(history, c.name, snapshot, true, now);
  }
  return history;
}

// Applies this run's scrapes to the history and writes postings.json and companies.json (R1, R2).
async function saveHistory(
  companies: Company[],
  history: TrackedPosting[],
  results: Map<string, { status: CompanyStatus; current: Posting[] | null; firstRun: boolean }>,
  now: Date
): Promise<void> {
  for (const c of companies) {
    const r = results.get(c.name);
    if (r) history = updateCompany(history, c.name, r.current, r.firstRun, now);
  }
  history = pruneClosed(history, now);
  await writeFile(POSTINGS_FILE, JSON.stringify(history, null, 2));

  const status = companies.map((c) => ({
    name: c.name,
    careersUrl: c.url,
    status: results.get(c.name)!.status,
    lastChecked: now.toISOString(),
    openCount: history.filter((p) => p.company === c.name && !p.closedAt).length,
  }));
  await writeFile(COMPANIES_FILE, JSON.stringify(status, null, 2));
}

async function monitor(): Promise<void> {
  const [companies, recipes, priority] = await Promise.all([
    loadCompanies(),
    loadRecipes(),
    isPriority(),
  ]);
  const now = new Date();
  const history = await loadHistory(companies, now);

  const allFresh: Posting[] = [];
  const warnings: string[] = [];
  // Scrape results per company, applied to the history after all batches finish.
  // null current = scrape failed, so its postings stay as they were (not closed).
  const results = new Map<string, { status: CompanyStatus; current: Posting[] | null; firstRun: boolean }>();

  // Concurrency-limited: batches of 5.
  for (let i = 0; i < companies.length; i += 5) {
    await Promise.all(
      companies.slice(i, i + 5).map(async (company) => {
        try {
          const { fresh, current, firstRun, warning } = await monitorCompany(company, recipes[company.name]);
          allFresh.push(...fresh);
          if (warning) warnings.push(warning);
          results.set(company.name, { status: current ? "ok" : "no-recipe", current, firstRun });
        } catch (err) {
          results.set(company.name, { status: "broken", current: null, firstRun: false });
          warnings.push(`${company.name}: FAILED — ${err instanceof Error ? err.message : err}`);
        }
      })
    );
  }

  await saveHistory(companies, history, results, now);

  for (const posting of allFresh.filter(priority)) {
    await sendAlert(posting);
  }
  await sendBrief(allFresh);
  for (const w of warnings) console.warn(`⚠️ ${w}`);
}

async function bootstrap(name?: string): Promise<void> {
  const companies = await loadCompanies();
  const recipes = await loadRecipes();
  const targets = name ? companies.filter((c) => c.name === name) : companies.filter((c) => !recipes[c.name]);
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
