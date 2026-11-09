/**
 * real-data.spec.ts: the built site against the actual postings.json and companies.json.
 * Counts come straight from the file here, not from the site's own filter code.
 */

import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

interface Row {
  title: string;
  company: string;
  baseline: boolean;
  closedAt?: string;
}

const postings: Row[] = JSON.parse(readFileSync(new URL("../public/data/postings.json", import.meta.url), "utf8"));

test("every open posting is on the board once Canada only is off", async ({ page }) => {
  await page.goto("");
  await page.getByLabel("Canada and remote only").uncheck();
  await expect(page.getByTestId("posting")).toHaveCount(postings.filter((p) => !p.closedAt).length);
});

test("show closed brings every posting onto the board", async ({ page }) => {
  await page.goto("");
  await page.getByLabel("Canada and remote only").uncheck();
  await page.getByLabel("Show closed").check();
  await expect(page.getByTestId("posting")).toHaveCount(postings.length);
});

test("the default view hides American-only cities", async ({ page }) => {
  await page.goto("");
  await page.getByTestId("posting").first().waitFor();
  const locations = await page.locator(".posting .location").allTextContents();
  expect(locations.length).toBeGreaterThan(0);
  for (const location of locations) expect(location).not.toMatch(/^(San Francisco|New York|Seattle|Hybrid - )/);
});

test("baseline rows show no age and live in the bottom group", async ({ page }) => {
  await page.goto("");
  await page.getByLabel("Canada and remote only").uncheck();
  await page.getByTestId("posting").first().waitFor();
  const last = page.locator(".group").last();
  await expect(last.locator("h2")).toHaveText("Already open when tracking began");
  expect(await last.getByTestId("posting").count()).toBe(postings.filter((p) => p.baseline && !p.closedAt).length);
  for (const age of await last.locator(".age").allTextContents()) expect(age).toBe("");
});

test("the highlighted choice stays in view when moving through a long list", async ({ page }) => {
  await page.goto("");
  await page.getByTestId("posting").first().waitFor();
  await page.getByRole("combobox", { name: "Company" }).focus();
  for (let i = 0; i < 15; i++) await page.keyboard.press("ArrowDown");
  const list = (await page.getByRole("listbox").boundingBox())!;
  const active = (await page.locator(".search-select li.active").boundingBox())!;
  expect(active.y).toBeGreaterThanOrEqual(list.y);
  expect(active.y + active.height).toBeLessThanOrEqual(list.y + list.height);
});

test("loads in under 2 seconds on a throttled connection", async ({ page }) => {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 40, downloadThroughput: 1250000, uploadThroughput: 500000 });
  const start = Date.now();
  await page.goto("");
  await page.getByTestId("posting").first().waitFor();
  expect(Date.now() - start).toBeLessThan(2000);
});

test("real data at phone and desktop width", async ({ page }, info) => {
  for (const [name, width, height] of [["real-phone", 375, 667], ["real-desktop", 1280, 800]] as const) {
    await page.setViewportSize({ width, height });
    await page.goto("");
    await page.getByTestId("posting").first().waitFor();
    const widths = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
    expect(widths[0]).toBeLessThanOrEqual(widths[1]!);
    await page.screenshot({ path: info.outputPath(`${name}.png`) });
  }
});
