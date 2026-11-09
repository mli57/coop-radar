/**
 * board.spec.ts: one check per R4 and R6 requirement, on the built site, with made-up data
 * whose right answers are known. The clock is fixed at 10:00am Toronto time on Nov 9.
 */

import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const NOW = "2026-11-09T15:00:00.000Z";

const make = (id: string, over: object) => ({
  id,
  company: "Acme",
  title: `${id} Intern`,
  url: `https://example.com/${id}`,
  location: "Toronto, ON",
  firstSeen: "2026-11-09T12:00:00.000Z",
  lastSeen: NOW,
  baseline: false,
  ...over,
});

const POSTINGS = [
  make("Today", { title: "Today Intern - Winter 2027" }),
  make("Yesterday", { company: "Beta", location: "Remote (United States | Canada)", firstSeen: "2026-11-08T15:00:00.000Z", title: "Yesterday Intern - Summer 2027" }),
  make("Older", { title: "Older Data Intern", location: "Waterloo / Ottawa / Ontario", firstSeen: "2026-11-05T15:00:00.000Z" }),
  make("American", { company: "Gamma", location: "San Francisco, CA", firstSeen: "2026-11-09T14:00:00.000Z" }),
  make("Unknown", { company: "Delta", location: undefined, firstSeen: "2026-11-09T13:00:00.000Z" }),
  make("Baseline", { company: "Zeta", baseline: true, firstSeen: "2026-11-09T12:30:00.000Z" }),
  make("Closed", { company: "Beta", firstSeen: "2026-11-09T12:10:00.000Z", closedAt: "2026-11-09T14:00:00.000Z" }),
];

const COMPANIES = [{ name: "Acme", careersUrl: "https://example.com", status: "ok", lastChecked: "2026-11-09T14:48:00.000Z", openCount: 2 }];

async function open(page: Page, lastVisit?: string) {
  await page.clock.setFixedTime(NOW);
  await page.route("**/data/postings.json", (route) => route.fulfill({ json: POSTINGS }));
  await page.route("**/data/companies.json", (route) => route.fulfill({ json: COMPANIES }));
  if (lastVisit) {
    // Only before the first load, so a refresh sees what the site itself stored
    await page.addInitScript((value) => {
      if (!localStorage.getItem("coop-radar:lastLoad")) localStorage.setItem("coop-radar:lastLoad", value);
    }, lastVisit);
  }
  await page.goto("");
  await page.getByTestId("posting").first().waitFor();
}

const rows = (page: Page) => page.getByTestId("posting");
const row = (page: Page, name: string) => rows(page).filter({ hasText: name });
const heads = (page: Page) => page.locator(".group h2").allTextContents();

test("groups by day, newest first, baseline at the bottom", async ({ page }) => {
  await open(page);
  expect(await heads(page)).toEqual(["Today", "Yesterday", "Nov 5", "Already open when tracking began"]);
  const titles = await page.locator(".title").allTextContents();
  expect(titles).toEqual(["Unknown Intern", "Today Intern - Winter 2027", "Yesterday Intern - Summer 2027", "Older Data Intern", "Baseline Intern"]);
});

test("a row shows company, title, location, age and an Apply link in a new tab", async ({ page }) => {
  await open(page);
  const first = row(page, "Today Intern");
  await expect(first).toContainText("Acme");
  await expect(first).toContainText("Toronto, ON");
  await expect(first).toContainText("3h ago");
  const apply = first.getByRole("link", { name: /Apply/ });
  await expect(apply).toHaveAttribute("href", "https://example.com/Today");
  await expect(apply).toHaveAttribute("target", "_blank");
});

test("baseline postings show no age", async ({ page }) => {
  await open(page);
  await expect(row(page, "Baseline").locator(".age")).toHaveText("");
});

test("search matches title and company", async ({ page }) => {
  await open(page);
  await page.getByRole("searchbox").fill("yesterday");
  await expect(rows(page)).toHaveCount(1);
  await page.getByRole("searchbox").fill("delta");
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page)).toContainText("Unknown Intern");
});

test("Canada is the default, no-location stays visible, and the toggle shows everything", async ({ page }) => {
  await open(page);
  await expect(row(page, "American")).toHaveCount(0);
  await expect(row(page, "Unknown")).toHaveCount(1);
  await page.getByLabel("Canada and remote only").uncheck();
  await expect(row(page, "American")).toHaveCount(1);
});

test("company, location and term filters work", async ({ page }) => {
  await open(page);
  const company = page.getByRole("combobox", { name: "Company" });
  await company.fill("bet");
  await expect(rows(page)).toHaveCount(1);
  await page.getByRole("option", { name: "Beta" }).click();
  await expect(company).toHaveValue("Beta");
  await expect(page.getByRole("listbox")).toHaveCount(0);
  await page.getByRole("button", { name: "Clear Company" }).click();
  await expect(rows(page)).toHaveCount(5);

  const location = page.getByRole("combobox", { name: "Location" });
  await location.fill("Rem");
  await expect(page.getByRole("listbox").getByRole("option")).toHaveText(["Remote"]);
  await expect(rows(page)).toContainText("Yesterday Intern");
  await location.fill("Waterloo");
  await expect(rows(page)).toContainText("Older Data Intern");
  await page.getByRole("button", { name: "Clear Location" }).click();

  await page.getByLabel("Field", { exact: true }).selectOption("Data");
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page)).toContainText("Older Data Intern");
  await page.getByLabel("Field", { exact: true }).selectOption("");

  await page.getByLabel("Term").selectOption("Winter 2027");
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page)).toContainText("Today Intern");
});

test("each row shows its field", async ({ page }) => {
  await open(page);
  await expect(row(page, "Older Data Intern").locator(".field")).toHaveText("Data");
  await expect(row(page, "Today Intern").locator(".field")).toHaveText("Other");
});

test("Location search finds places not in the list once Canada only is off", async ({ page }) => {
  await open(page);
  await page.getByLabel("Canada and remote only").uncheck();
  await page.getByRole("combobox", { name: "Location" }).fill("san fran");
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page)).toContainText("American Intern");
});

test("ArrowUp from an open list starts at the last choice", async ({ page }) => {
  await open(page);
  const company = page.getByRole("combobox", { name: "Company" });
  await company.focus();
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("Enter");
  await expect(company).toHaveValue("Zeta");
});

test("clearing a box keeps focus in it and leaves the list closed, with room for the clear button", async ({ page }) => {
  await open(page);
  const company = page.getByRole("combobox", { name: "Company" });
  await company.fill("Beta");
  await expect(company).toHaveCSS("padding-right", "28px");
  await page.getByRole("button", { name: "Clear Company" }).click();
  await expect(company).toBeFocused();
  await expect(company).toHaveValue("");
  await expect(page.getByRole("listbox")).toHaveCount(0);
});

test("leaving a box forgets the highlighted choice", async ({ page }) => {
  await open(page);
  const company = page.getByRole("combobox", { name: "Company" });
  await company.focus();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Tab");
  await company.focus();
  await page.keyboard.press("Enter");
  await expect(company).toHaveValue("");
});

test("titles keep readable room just above the phone layout", async ({ page }) => {
  await page.setViewportSize({ width: 1101, height: 800 });
  await open(page);
  const box = await rows(page).first().locator(".title").boundingBox();
  expect(box!.width).toBeGreaterThanOrEqual(250);
});

test("the Company box works by keyboard and closes when you leave it", async ({ page }) => {
  await open(page);
  const company = page.getByRole("combobox", { name: "Company" });
  await company.focus();
  await expect(page.getByRole("listbox").getByRole("option")).toHaveCount(5);
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(company).toHaveValue("Acme");
  await company.focus();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("listbox")).toHaveCount(0);
  await company.click();
  await expect(page.getByRole("listbox")).toHaveCount(1);
  await page.getByRole("searchbox").click();
  await expect(page.getByRole("listbox")).toHaveCount(0);
});

test("the open Company list passes an accessibility scan and sits above the rows", async ({ page }, info) => {
  await open(page);
  await page.getByRole("combobox", { name: "Company" }).click();
  await expect(page.getByRole("option", { name: "Acme" })).toBeVisible();
  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(", ")}`)).toEqual([]);
  await page.getByRole("option", { name: "Zeta" }).click();
  await expect(rows(page)).toHaveCount(1);
  await page.getByRole("combobox", { name: "Company" }).click();
  await page.screenshot({ path: info.outputPath("open-list.png") });
});

test("closed postings are hidden until asked for, then greyed with no Apply link", async ({ page }) => {
  await open(page);
  await expect(row(page, "Closed Intern")).toHaveCount(0);
  await page.getByLabel("Show closed").check();
  const closed = row(page, "Closed Intern");
  await expect(closed).toContainText("Closed Nov 9");
  await expect(closed.getByRole("link")).toHaveCount(0);
  await expect(closed.locator(".title")).toHaveCSS("color", "rgb(86, 111, 122)");
});

test("a first visit shows no New badges", async ({ page }) => {
  await open(page);
  await expect(page.locator(".new")).toHaveCount(0);
});

test("New badges mark only postings seen appearing since the last visit, and survive a refresh", async ({ page }) => {
  await open(page, "2026-11-09T11:30:00.000Z");
  const check = async () => {
    await expect(page.locator(".new")).toHaveCount(2);
    await expect(row(page, "Today Intern").locator(".new")).toHaveCount(1);
    await expect(row(page, "Unknown Intern").locator(".new")).toHaveCount(1);
    await expect(row(page, "Baseline Intern").locator(".new")).toHaveCount(0);
  };
  await check();
  await page.reload();
  await rows(page).first().waitFor();
  await check();
  await page.getByLabel("Show closed").check();
  await expect(row(page, "Closed Intern").locator(".new")).toHaveCount(0);
});

test("shows when the data was last updated", async ({ page }) => {
  await open(page);
  await expect(page.locator(".updated")).toHaveText("Updated 12m ago");
});

test("the board doesn't show the About text", async ({ page }) => {
  await open(page);
  await expect(page.locator(".about")).toHaveCount(0);
});

test("About is its own page that explains the site and links the repo", async ({ page }) => {
  await open(page);
  await page.getByRole("link", { name: "About" }).click();
  await expect(page).toHaveURL(/#about$/);
  await expect(page.locator(".about")).toContainText("free");
  await expect(page.locator(".about")).toContainText("every 30 minutes");
  await expect(page.getByRole("link", { name: /GitHub/ })).toHaveAttribute("href", "https://github.com/mli57/coop-radar");
  await expect(rows(page)).toHaveCount(0);
  await expect(page.getByRole("searchbox")).toHaveCount(0);
});

test("coming back from About keeps the filters, by link and by the back button", async ({ page }) => {
  await open(page);
  await page.getByRole("searchbox").fill("delta");
  await page.getByRole("link", { name: "About" }).click();
  await page.getByRole("link", { name: "Postings" }).click();
  await expect(page.getByRole("searchbox")).toHaveValue("delta");
  await expect(rows(page)).toHaveCount(1);

  await page.getByRole("link", { name: "About" }).click();
  await expect(page.locator(".about")).toBeVisible();
  await page.goBack();
  await expect(rows(page)).toHaveCount(1);
});

test("the site name goes back to the board", async ({ page }) => {
  await open(page);
  await page.getByRole("link", { name: "About" }).click();
  await page.getByRole("link", { name: "coop-radar" }).click();
  await expect(rows(page)).toHaveCount(5);
});

test("the About address opens the About page directly, and passes an accessibility scan", async ({ page }) => {
  await page.route("**/data/postings.json", (route) => route.fulfill({ json: POSTINGS }));
  await page.route("**/data/companies.json", (route) => route.fulfill({ json: COMPANIES }));
  await page.goto("#about");
  await expect(page.locator(".about")).toBeVisible();
  await expect(rows(page)).toHaveCount(0);
  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(", ")}`)).toEqual([]);
});

test("the browser tab names the page, and About is easy to tap on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await open(page);
  await expect(page).toHaveTitle("coop-radar");
  const link = page.getByRole("link", { name: "About" });
  expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await link.click();
  await expect(page).toHaveTitle("About - coop-radar");
});

test("the back button returns to the same place on the board", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 300 });
  await open(page);
  await page.evaluate(() => window.scrollTo(0, 400));
  await page.evaluate(() => (location.hash = "about"));
  await expect(page.locator(".about")).toBeVisible();
  await page.goBack();
  await expect(rows(page).first()).toBeAttached();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(400);
});

test("About opens at the top even from far down the board", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 300 });
  await open(page);
  await page.evaluate(() => window.scrollTo(0, 400));
  await page.evaluate(() => (location.hash = "about"));
  await expect(page.locator(".about")).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
});

test("empty results explain themselves and can be cleared", async ({ page }) => {
  await open(page);
  await page.getByRole("searchbox").fill("zzzz");
  await expect(rows(page)).toHaveCount(0);
  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(rows(page)).toHaveCount(5);
});

test("a failed load says so", async ({ page }) => {
  await page.route("**/data/postings.json", (route) => route.fulfill({ status: 500 }));
  await page.goto("");
  await expect(page.getByText("Postings could not be loaded")).toBeVisible();
});

test("passes an accessibility scan, including closed rows", async ({ page }) => {
  await open(page, "2026-11-09T11:30:00.000Z");
  await page.getByLabel("Show closed").check();
  await page.getByLabel("Canada and remote only").uncheck();
  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(", ")}`)).toEqual([]);
});

for (const [name, width, height] of [["phone", 375, 667], ["small-phone", 320, 568], ["tablet", 768, 1024], ["desktop", 1280, 800]] as const) {
  test(`fits at ${name} width`, async ({ page }, info) => {
    await page.setViewportSize({ width, height });
    await open(page, "2026-11-09T11:30:00.000Z");
    const widths = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
    expect(widths[0]).toBeLessThanOrEqual(widths[1]!);
    await page.screenshot({ path: info.outputPath(`${name}.png`) });
  });
}

test("on a phone the first posting is visible without scrolling and Apply is easy to tap", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await open(page);
  await expect(rows(page).first()).toBeInViewport({ ratio: 1 });
  const box = await rows(page).first().getByRole("link").boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(44);
});

test("keyboard focus is visible on Apply links", async ({ page }) => {
  await open(page);
  const apply = rows(page).first().getByRole("link");
  await page.getByLabel("Show closed").focus();
  await page.keyboard.press("Tab");
  await expect(apply).toBeFocused();
  await expect(apply).toHaveCSS("outline-style", "solid");
});
