/**
 * scraper.ts: pulls the current list of postings off one company's job board.
 *
 * Each company has a Recipe (config/recipes.json) saying which platform hosts its job board and how to reach it. 
 * Most platforms (Ashby, Greenhouse, Lever, Workday, Recruitee) expose their listings as a public JSON API,
 * so those recipes just fetch and reshape that JSON. Companies with no such API fall back to a css recipe,
 * which opens the page in a browser and reads the postings off the rendered HTML instead.
 *
 * 1. loadRecipes: reads every company's recipe back from config/recipes.json.
 * 2. scrapeCompany: the entry point that picks the right scraper for a recipe type and runs it.
 *
 * Called by monitorCompany() in main.ts once per company per run.
 */

import { readFile } from "node:fs/promises";
import { RELEVANT_TITLE, type Posting, type Recipe } from "./types.js";

// returns a dict of recipes of the company name and which ATS backend they use
export async function loadRecipes(): Promise<Record<string, Recipe>> {
  try {
    return JSON.parse(await readFile("config/recipes.json", "utf8"));
  } catch {
    return {};
  }
}

// wrapper for fetch, returns an error if HTTP response isnt ok
async function fetchJson(url: string): Promise<any> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} returned ${res.status}`);
  return res.json();
}

// Given the company string and their corresponding token, call fetchJson(gives current list of posted positions)
// Then returns the list of the job postings(each post has its corresponding company, title, url, location)
async function scrapeAshby(company: string, token: string): Promise<Posting[]> {
  const data = await fetchJson(`https://api.ashbyhq.com/posting-api/job-board/${token}`);
  return data.jobs.map((job: any) => ({
    company,
    title: job.title,
    url: job.jobUrl,
    location: job.location,
  }));
}

// same thing, but for greenhouse
async function scrapeGreenhouse(company: string, token: string): Promise<Posting[]> {
  const data = await fetchJson(`https://boards-api.greenhouse.io/v1/boards/${token}/jobs`);
  return data.jobs.map((job: any) => ({
    company,
    title: job.title,
    url: job.absolute_url,
    location: job.location?.name,
  }));
}

// same thing but for lever
async function scrapeLever(company: string, token: string): Promise<Posting[]> {
  const data = await fetchJson(`https://api.lever.co/v0/postings/${token}?mode=json`);
  return data.map((job: any) => ({
    company,
    title: job.text,
    url: job.hostedUrl,
    location: job.categories?.location,
  }));
}

// Workday boards are too big to read whole (BMO has 600+ jobs), so we search them for student roles.
// Its search is loose ("intern" also finds "internal" and words in job descriptions), so the titles are
// checked again here. Narrower words were tried and missed roles: "internship" skips "Engineering Intern".
const WORKDAY_SEARCHES = ["intern", "co-op", "student"];

async function postJson(url: string, body: unknown): Promise<any> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${url} returned ${res.status}`); // a dead site returns 404, so the recipe counts as broken
  return res.json();
}

// Searches each site page by page until a short page or the total says we've reached the end.
async function scrapeWorkday(company: string, tenant: string, wdInstance: string, sites: string[]): Promise<Posting[]> {
  const base = `https://${tenant}.${wdInstance}.myworkdayjobs.com`;
  const pageSize = 20;
  // Keyed by the job's own path, not the full URL: one role can match several searches, or sit on two
  // of a company's boards. The first board's URL is kept.
  const found = new Map<string, Posting>();
  let matches = 0; // jobs any search matched, student or not
  for (const site of sites) {
    for (const searchText of WORKDAY_SEARCHES) {
      // Some boards keep serving full pages past the end and only report a real total on page 1, so it's kept.
      let total = Infinity;
      for (let offset = 0; offset < total; offset += pageSize) {
        const data = await postJson(`${base}/wday/cxs/${tenant}/${site}/jobs`, {
          appliedFacets: {},
          limit: pageSize,
          offset,
          searchText,
        });
        if (offset === 0) total = data.total ?? Infinity;
        const page = data.jobPostings ?? [];
        matches += page.length;
        for (const job of page) {
          if (!RELEVANT_TITLE.test(job.title) || found.has(job.externalPath)) continue;
          const url = `${base}/en-US/${site}${job.externalPath}`;
          found.set(job.externalPath, { company, title: job.title, url, location: job.locationsText });
        }
        if (page.length < pageSize) break;
      }
    }
  }
  // "intern" always matches something on a live board ("internal", "international"), so nothing at all
  // means a hiccup or an emptied site. Failing keeps that from closing every posting.
  if (matches === 0) throw new Error("Workday searches matched no jobs at all");

  // "3 Locations" or no location at all (Thomson Reuters) doesn't say where, so read it off the posting itself.
  // Without this, blank ones would show in the Canada view even when the job is in London.
  for (const p of found.values()) {
    if (p.location && !/^\d+ Locations$/i.test(p.location)) continue;
    try {
      const { jobPostingInfo } = await fetchJson(p.url.replace(`${base}/en-US/`, `${base}/wday/cxs/${tenant}/`));
      p.location = [jobPostingInfo.location, ...(jobPostingInfo.additionalLocations ?? [])].join("; ");
    } catch {
      // posting was taken down between the search and this lookup, keep what the search gave
    }
  }
  return [...found.values()];
}

// Similar to Ashby/Greenhouse/Lever, cityFilter narrows results down
async function scrapeRecruitee(company: string, subdomain: string, cityFilter?: string[]): Promise<Posting[]> {
  const data = await fetchJson(`https://${subdomain}.recruitee.com/api/offers/`);
  return data.offers
    .filter((o: any) => !cityFilter || cityFilter.includes(o.city))
    .map((o: any) => ({ company, title: o.title, url: o.careers_url, location: o.city }));
}

// css recipe exists as the fallback for companies with no public ATS API.
async function scrapeCss(company: string, url: string, selector: string): Promise<Posting[]> {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: "load", timeout: 30_000 });
    await page.waitForSelector(selector, { timeout: 15_000 }); // postings may render after page load via JS
    return await page.$$eval(
      selector,
      // runs inside the browser page, not Node. Must stay one inline anonymous function: pulling
      // the per-element logic into its own named const breaks at runtime (esbuild wraps named
      // functions with a helper for stack traces that Playwright doesn't ship into the browser).
      (postingElements, company) =>
        postingElements.flatMap((postingElement) => {
          // postingElement may be the <a> itself, or a card div wrapping one
          const link = postingElement.matches("a[href]") ? postingElement : postingElement.querySelector("a[href]");
          const title = (link?.textContent ?? postingElement.textContent ?? "").trim();
          const href = link?.getAttribute("href");
          if (!title || !href) return []; // drop entries w/o title or href
          return [{ company, title, url: new URL(href, location.href).href }]; // href may be relative
        }),
      company
    );
  } 
  
  finally { // close browser when done
    await browser.close();
  }
}

// Entry point, responsible for sorting posts to the right scraper based on the recipe type.
export async function scrapeCompany(company: string, recipe: Recipe): Promise<Posting[]> {
  switch (recipe.type) {
    case "ashby":
      return scrapeAshby(company, recipe.token);
    case "greenhouse":
      return scrapeGreenhouse(company, recipe.token);
    case "lever":
      return scrapeLever(company, recipe.token);
    case "css":
      return scrapeCss(company, recipe.url, recipe.selector);
    case "workday":
      return scrapeWorkday(company, recipe.tenant, recipe.wdInstance, recipe.sites);
    case "recruitee":
      return scrapeRecruitee(company, recipe.subdomain, recipe.cityFilter);
  }
}
