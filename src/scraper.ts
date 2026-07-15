import { readFile } from "node:fs/promises";
import type { Posting, Recipe } from "./types.js";

export async function loadRecipes(): Promise<Record<string, Recipe>> {
  try {
    return JSON.parse(await readFile("config/recipes.json", "utf8"));
  } catch {
    return {};
  }
}

async function fetchJson(url: string): Promise<any> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} returned ${res.status}`);
  return res.json();
}

async function scrapeAshby(company: string, token: string): Promise<Posting[]> {
  const data = await fetchJson(`https://api.ashbyhq.com/posting-api/job-board/${token}`);
  return data.jobs.map((j: any) => ({
    company,
    title: j.title,
    url: j.jobUrl,
    location: j.location,
  }));
}

async function scrapeGreenhouse(company: string, token: string): Promise<Posting[]> {
  const data = await fetchJson(`https://boards-api.greenhouse.io/v1/boards/${token}/jobs`);
  return data.jobs.map((j: any) => ({
    company,
    title: j.title,
    url: j.absolute_url,
    location: j.location?.name,
  }));
}

async function scrapeLever(company: string, token: string): Promise<Posting[]> {
  const data = await fetchJson(`https://api.lever.co/v0/postings/${token}?mode=json`);
  return data.map((j: any) => ({
    company,
    title: j.text,
    url: j.hostedUrl,
    location: j.categories?.location,
  }));
}

async function scrapeCss(company: string, url: string, selector: string): Promise<Posting[]> {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: "load", timeout: 30_000 });
    await page.waitForSelector(selector, { timeout: 15_000 });
    return await page.$$eval(
      selector,
      (els, company) =>
        els.flatMap((el) => {
          const a = el.matches("a[href]") ? el : el.querySelector("a[href]");
          const title = (a?.textContent ?? el.textContent ?? "").trim();
          const href = a?.getAttribute("href");
          if (!title || !href) return [];
          return [{ company, title, url: new URL(href, location.href).href }];
        }),
      company
    );
  } finally {
    await browser.close();
  }
}

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
  }
}
