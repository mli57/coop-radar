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
import { isCanadian } from "../web/src/lib/location.js";
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

// Workday boards are too big to read whole (Citi has 2000+ jobs), so each board is narrowed to its Canadian
// jobs with the board's own location filter, then every one of those is read and the titles checked here.
// Workday's own student filter isn't used: companies leave it off many student jobs (BMO tags 12, we find 40).

async function postJson(url: string, body: unknown): Promise<any> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${url} returned ${res.status}`); // a dead site returns 404, so the recipe counts as broken
  return res.json();
}

// Picks the board's filter for Canadian jobs out of the facets an unfiltered search returns.
// Boards name it differently ("Country", "locationCountry", "Country_and_Jurisdiction"), and some only
// have a list of offices ("Calgary", "CA-QC-LONGUEUIL-J01"). A country-wide "Canada" option is preferred;
// otherwise every office the website would count as Canadian is used. Returns null when there are none,
// and no filter ({}) when the board has no location filter at all.
export function canadaFilter(facets: any[]): Record<string, string[]> | null {
  const options: { param: string; name: string; id: string }[] = [];
  const collect = (list: any[], param?: string) => {
    for (const f of list ?? []) {
      const p = f.facetParameter ?? param;
      if (f.values) collect(f.values, p); // a group like "locationMainGroup" holds the real facets
      else if (f.id && f.descriptor) options.push({ param: p, name: f.descriptor, id: f.id });
    }
  };
  collect(facets);
  // Only location filters count: MLSE has a job category called "Toronto Maple Leafs".
  const places = options.filter((o) => /country|location|city|state|province|region/i.test(o.param));
  if (places.length === 0) return {}; // no location filter on this board (MLSE), so it's read whole
  // "La Canada Flintridge" is in California
  const canadian = places.filter((o) => isCanadian(o.name) && !/la ca[nñ]ada/i.test(o.name));
  const country = canadian.find((o) => o.name.trim().toLowerCase() === "canada");
  if (country) return { [country.param]: [country.id] };
  if (canadian.length === 0) return null;
  // Options under different filters narrow each other, so only one filter can be used: the one with the most offices.
  const count = (param: string) => canadian.filter((o) => o.param === param).length;
  const param = canadian.map((o) => o.param).sort((a, b) => count(b) - count(a))[0]!;
  return { [param]: canadian.filter((o) => o.param === param).map((o) => o.id) };
}

// Reads every Canadian job on each site page by page, until a short page or the total says it's the end.
async function scrapeWorkday(company: string, tenant: string, wdInstance: string, sites: string[]): Promise<Posting[]> {
  const base = `https://${tenant}.${wdInstance}.myworkdayjobs.com`;
  const pageSize = 20;
  // Keyed by the job's own path, not the full URL: one role can sit on two of a company's boards.
  // The first board's URL is kept.
  const found = new Map<string, Posting>();
  for (const site of sites) {
    const search = (appliedFacets: Record<string, string[]>, offset: number) =>
      postJson(`${base}/wday/cxs/${tenant}/${site}/jobs`, { appliedFacets, limit: pageSize, offset, searchText: "" });
    // Unfiltered first, to read the filter options. The ids are looked up every run, so a company renaming
    // its offices can't silently break the recipe.
    const first = await search({}, 0);
    // A live board with nothing on it at all is rare, so treat it as a hiccup or a removed site.
    // Failing keeps that from closing every posting.
    if (!first.total && !first.jobPostings?.length) throw new Error(`Workday site ${site} has no jobs at all`);
    const filter = canadaFilter(first.facets);
    if (!filter) continue; // no Canadian jobs on this site right now

    // Some boards keep serving full pages past the end and only report a real total on page 1, so it's kept.
    let total = Infinity;
    for (let offset = 0; offset < total; offset += pageSize) {
      const data = await search(filter, offset);
      if (offset === 0) total = data.total ?? Infinity;
      const page = data.jobPostings ?? [];
      for (const job of page) {
        if (!RELEVANT_TITLE.test(job.title) || found.has(job.externalPath)) continue;
        const url = `${base}/en-US/${site}${job.externalPath}`;
        found.set(job.externalPath, { company, title: job.title, url, location: job.locationsText });
      }
      if (page.length < pageSize) break;
    }
  }

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
