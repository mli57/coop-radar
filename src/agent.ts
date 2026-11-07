/**
 * agent.ts: figures out how to scrape a new company (its "recipe"). Only used in bootstrap mode.
 *
 * 1. Opens the careers page in a headless browser.
 * 2. Looks for a known job board (Ashby, Greenhouse, Lever) in the page. If found, the recipe
 *    uses that board's public API.
 * 3. If none is found, asks Gemini for a CSS selector and test-scrapes it, retrying once.
 *
 * Monitor mode doesn't use this file, it just follows saved recipes in scraper.ts.
 * The one exception is main.ts re-bootstrapping a recipe that stopped working.
 */
import { readFile, writeFile } from "node:fs/promises";
import { chromium } from "playwright";
import { scrapeCompany } from "./scraper.js";
import type { Recipe } from "./types.js";

const RECIPES_PATH = "config/recipes.json";

// URL patterns for each supported job board. The captured group is the company's token on that board.
// Most boards embed or link a known ATS — detecting it means the recipe hits a
// stable JSON API instead of scraping HTML. LLM fallback only when none found.
const ATS_PATTERNS: { type: "ashby" | "greenhouse" | "lever"; re: RegExp }[] = [
  { type: "ashby", re: /jobs\.ashbyhq\.com\/([\w.%-]+)/ },
  { type: "greenhouse", re: /greenhouse\.io\/embed\/job_board\?for=([\w-]+)/ },
  { type: "greenhouse", re: /(?:job-boards|boards)\.greenhouse\.io\/(?!embed)([\w-]+)/ },
  { type: "lever", re: /jobs\.lever\.co\/([\w-]+)/ },
];

// Loads a page and returns its rendered HTML plus the URL it ended up on after any redirects.
async function renderPage(url: string): Promise<{ html: string; finalUrl: string }> {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    // "networkidle" never fires on sites with constant analytics traffic —
    // wait for load, then give SPAs a beat to render.
    await page.goto(url, { waitUntil: "load", timeout: 45_000 });
    await page.waitForTimeout(5_000);
    return { html: await page.content(), finalUrl: page.url() };
  } finally {
    await browser.close();
  }
}

// Finds the job board hidden behind a company's own careers page. haystack is the text searched
// (final URL plus page HTML). Each pattern match is test-scraped so a dead token is skipped.
async function detectAts(company: string, haystack: string): Promise<Recipe | null> {
  for (const { type, re } of ATS_PATTERNS) {
    const token = haystack.match(re)?.[1];
    if (!token) continue;
    const recipe: Recipe = { type, token: decodeURIComponent(token) };
    try {
      if ((await scrapeCompany(company, recipe)).length > 0) return recipe;
    } catch {
      // matched token didn't resolve to a live board — keep looking
    }
  }
  return null;
}

// Strips scripts, styles, and extra whitespace so the HTML fits in the Gemini prompt.
function trimHtml(html: string): string {
  return html
    .replace(/<(script|style|svg|noscript)[\s\S]*?<\/\1>/gi, "")
    .replace(/\s+/g, " ")
    .slice(0, 150_000);
}

// Asks Gemini for a CSS selector matching one element per job. Only used when no job board was found.
async function askForSelector(html: string, feedback?: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set in .env");
  const prompt =
    `Below is the rendered HTML of a company careers page. Identify the CSS selector that matches one element per job listing, where each matched element contains (or is) a link to the individual posting. Prefer stable selectors (semantic tags, data attributes, readable class names) over hashed/generated class names.\n` +
    (feedback ? `A previous attempt failed: ${feedback}\n` : "") +
    `Reply with ONLY a JSON object: {"selector": "..."}\n\n${trimHtml(html)}`;
  // Free-tier quotas are per model — on 429, fall through to the next one.
  const models = ["gemini-flash-latest", "gemini-2.0-flash", "gemini-flash-lite-latest"];
  let res: Response | undefined;
  for (const model of models) {
    res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      }
    );
    if (res.status !== 429) break;
  }
  if (!res || !res.ok) throw new Error(`Gemini API failed: ${res?.status} ${await res?.text()}`);
  const data = await res.json();
  const text: string = data.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join("") ?? "";
  const json = text.match(/\{[\s\S]*\}/)?.[0];
  if (!json) throw new Error(`Agent returned no JSON: ${text}`);
  return JSON.parse(json).selector;
}

// Builds and saves a recipe for a company: job board API if one is detected, otherwise a CSS selector.
export async function bootstrapCompany(company: string, url: string): Promise<Recipe> {
  const { html, finalUrl } = await renderPage(url);

  // Prefer a job board API: faster and more stable than scraping HTML.
  const ats = await detectAts(company, finalUrl + "\n" + html);
  if (ats) {
    await saveRecipe(company, ats);
    return ats;
  }

  // No job board found: ask Gemini for a selector. On failure, retry once with the error as feedback.
  let feedback: string | undefined;
  for (let attempt = 0; attempt < 2; attempt++) {
    const selector = await askForSelector(html, feedback);
    const recipe: Recipe = { type: "css", url: finalUrl, selector };
    try {
      const postings = await scrapeCompany(company, recipe);
      if (postings.length > 0) { // selector found postings, keep it
        await saveRecipe(company, recipe);
        return recipe;
      }
      feedback = `selector "${selector}" matched 0 job listings`;
    } catch (err) {
      feedback = `selector "${selector}" threw: ${err}`;
    }
  }
  // Both attempts failed.
  throw new Error(`Bootstrap failed for ${company}: ${feedback}`);
}

// Adds or replaces this company's recipe in config/recipes.json.
async function saveRecipe(company: string, recipe: Recipe): Promise<void> {
  let recipes: Record<string, Recipe> = {};
  try {
    recipes = JSON.parse(await readFile(RECIPES_PATH, "utf8"));
  } catch {
    // no recipes yet
  }
  recipes[company] = recipe;
  await writeFile(RECIPES_PATH, JSON.stringify(recipes, null, 2));
}
