/**
 * companies.spec.ts: one check per R5 requirement, on the built site, with made-up company data.
 */

import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const NOW = "2026-11-09T15:00:00.000Z";
const checked = "2026-11-09T14:48:00.000Z";

const COMPANIES = [
  { name: "Zeta", careersUrl: "https://zeta.example/careers", status: "no-recipe", lastChecked: checked, openCount: 0 },
  { name: "Acme", careersUrl: "https://acme.example/careers", status: "ok", lastChecked: checked, openCount: 3 },
  { name: "Beta", careersUrl: "https://beta.example/jobs", status: "broken", lastChecked: checked, openCount: 1 },
];

async function open(page: Page) {
  await page.clock.setFixedTime(NOW);
  await page.route("**/data/postings.json", (route) => route.fulfill({ json: [] }));
  await page.route("**/data/companies.json", (route) => route.fulfill({ json: COMPANIES }));
  await page.goto("#companies");
  await page.getByTestId("company").first().waitFor();
}

const rows = (page: Page) => page.getByTestId("company");

test("lists every company by name, with the status and open count from companies.json", async ({ page }) => {
  await open(page);
  expect(await page.locator(".company-name").allTextContents()).toEqual(["Acme", "Beta", "Zeta"]);
  await expect(rows(page).filter({ hasText: "Acme" }).locator(".status")).toHaveText("Working");
  await expect(rows(page).filter({ hasText: "Beta" }).locator(".status")).toHaveText("Broken");
  await expect(rows(page).filter({ hasText: "Zeta" }).locator(".status")).toHaveText("Not set up yet");
  await expect(rows(page).filter({ hasText: "Acme" }).locator(".open")).toContainText("3");
  await expect(page.locator(".summary")).toContainText("3 tracked: 1 working, 1 broken, 1 not set up yet");
});

test("each company links its careers page in a new tab", async ({ page }) => {
  await open(page);
  const link = rows(page).filter({ hasText: "Beta" }).getByRole("link");
  await expect(link).toHaveAttribute("href", "https://beta.example/jobs");
  await expect(link).toHaveAttribute("target", "_blank");
});

test("the nav reaches Companies from the board and marks the current page", async ({ page }) => {
  await page.route("**/data/postings.json", (route) => route.fulfill({ json: [] }));
  await page.route("**/data/companies.json", (route) => route.fulfill({ json: COMPANIES }));
  await page.goto("");
  await page.getByRole("link", { name: "Companies" }).click();
  await expect(page).toHaveURL(/#companies$/);
  await expect(page).toHaveTitle("Companies - coop-radar");
  await expect(page.getByRole("link", { name: "Companies" })).toHaveAttribute("aria-current", "page");
});

test("Request a company opens a filled-in GitHub issue", async ({ page }) => {
  await open(page);
  await page.getByLabel("Company name").fill("Shopify");
  await page.getByLabel("Careers page URL").fill("https://www.shopify.com/careers");
  // Stop the new tab at the first address, before GitHub redirects a signed-out visitor to its login page
  await page.context().route("https://github.com/**", (route) => route.fulfill({ body: "" }));
  const popup = page.waitForEvent("popup");
  await page.getByRole("button", { name: "Request on GitHub" }).click();
  const url = new URL((await popup).url());
  expect(url.origin + url.pathname).toBe("https://github.com/mli57/coop-radar/issues/new");
  expect(url.searchParams.get("template")).toBe("request-company.yml");
  expect(url.searchParams.get("company")).toBe("Shopify");
  expect(url.searchParams.get("url")).toBe("https://www.shopify.com/careers");
  expect(url.searchParams.get("title")).toBe("Request: Shopify");
});

test("a very long name wraps on a phone, and a status the site doesn't know still shows", async ({ page }) => {
  const odd = [...COMPANIES, { ...COMPANIES[1], name: "A".repeat(300) }, { ...COMPANIES[1], name: "Paused Co", status: "paused" }];
  await page.setViewportSize({ width: 320, height: 700 });
  await page.route("**/data/postings.json", (route) => route.fulfill({ json: [] }));
  await page.route("**/data/companies.json", (route) => route.fulfill({ json: odd }));
  await page.goto("#companies");
  await page.getByTestId("company").first().waitFor();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await expect(rows(page).filter({ hasText: "Paused Co" }).locator(".status")).toHaveText("paused");
});

test("passes an accessibility scan and fits a phone", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await open(page);
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
