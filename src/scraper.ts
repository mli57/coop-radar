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
import type { Posting, Recipe } from "./types.js";

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

// Workday recipe uses page by page search API rather than a single JSON endpoint, so we POST page by page until 
// a short page (or total) tells us we've got everything.
async function scrapeWorkday(
  company: string,
  tenant: string,
  wdInstance: string,
  site: string,
  searchText = "",
  appliedFacets: Record<string, string[]> = {}
): Promise<Posting[]> {
  const base = `https://${tenant}.${wdInstance}.myworkdayjobs.com`;
  const postings: Posting[] = [];
  const pageSize = 20;
  let total = Infinity; // some Workday boards only report a real total on page 1, so its reused
  for (let offset = 0; ; offset += pageSize) {
    const data = await (
      await fetch(`${base}/wday/cxs/${tenant}/${site}/jobs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appliedFacets, limit: pageSize, offset, searchText }),
      })
    ).json();
    if (offset === 0) total = data.total;
    const page = data.jobPostings ?? [];
    for (const job of page) {
      postings.push({
        company,
        title: job.title,
        url: `${base}/en-US/${site}${job.externalPath}`,
        location: job.locationsText,
      });
    }
    if (page.length < pageSize || postings.length >= total) break;
  }
  return postings;
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
      return scrapeWorkday(
        company,
        recipe.tenant,
        recipe.wdInstance,
        recipe.site,
        recipe.searchText,
        recipe.appliedFacets
      );
    case "recruitee":
      return scrapeRecruitee(company, recipe.subdomain, recipe.cityFilter);
  }
}
