import { afterEach, describe, expect, it, vi } from "vitest";
import { findWorkday } from "./agent.js";
import { scrapeCompany } from "./scraper.js";

describe("findWorkday", () => {
  it("reads tenant, instance and site from a board URL", () => {
    expect(findWorkday("https://soti.wd3.myworkdayjobs.com/en-US/SOTI-Next-Gen/job/Mississauga/Intern_R1")).toEqual({
      type: "workday",
      tenant: "soti",
      wdInstance: "wd3",
      sites: ["SOTI-Next-Gen"],
    });
  });

  it("works without the locale part", () => {
    expect(findWorkday("https://cibc.wd3.myworkdayjobs.com/campus")?.sites).toEqual(["campus"]);
  });

  it("keeps every public site once, ignoring case", () => {
    const page = `
      <a href="https://rbc.wd3.myworkdayjobs.com/en-US/RBCGLOBAL1">jobs</a>
      <a href="https://rbc.wd3.myworkdayjobs.com/rbcglobal1/job/x">a job</a>
      <a href="https://rbc.wd3.myworkdayjobs.com/en-US/RBCEARLYTALENT1">students</a>`;
    expect(findWorkday(page)?.sites).toEqual(["RBCGLOBAL1", "RBCEARLYTALENT1"]);
  });

  it("skips private boards and Workday's API path", () => {
    const page = `
      https://bmo.wd3.myworkdayjobs.com/wday/cxs/bmo/External/jobs
      https://bmo.wd3.myworkdayjobs.com/en-US/Privileged
      https://bmo.wd3.myworkdayjobs.com/en-US/Campus`;
    expect(findWorkday(page)?.sites).toEqual(["Campus"]);
  });

  it("returns null when there is no Workday board", () => {
    expect(findWorkday("https://job-boards.greenhouse.io/figma")).toBeNull();
    expect(findWorkday("https://rbc.wd3.myworkdayjobs.com/en-US/ExternalPrivatePostingStudents")).toBeNull();
  });
});

describe("Workday scraping", () => {
  afterEach(() => vi.unstubAllGlobals());

  const recipe = { type: "workday" as const, tenant: "acme", wdInstance: "wd3", sites: ["Careers"] };
  const base = "https://acme.wd3.myworkdayjobs.com";
  const job = (n: number, title: string, locationsText = "Toronto, ON") => ({ title, externalPath: `/job/${n}`, locationsText });

  // Fakes Workday: `boards` maps a search word to the jobs it finds, served 20 per page.
  type Job = { title: string; externalPath: string; locationsText?: string };
  function fakeWorkday(boards: Record<string, Job[]>, details: Record<string, unknown> = {}) {
    const calls: string[] = [];
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      calls.push(url);
      if (init?.method === "POST") {
        const { searchText, offset, limit } = JSON.parse(init.body as string);
        const jobs = boards[searchText] ?? [];
        return Response.json({ total: jobs.length, jobPostings: jobs.slice(offset, offset + limit) });
      }
      const detail = details[url];
      return detail ? Response.json({ jobPostingInfo: detail }) : new Response("", { status: 404 });
    });
    return calls;
  }

  it("keeps only student titles, once each, with the posting's own URL", async () => {
    fakeWorkday({
      intern: [job(1, "Software Developer Intern"), job(2, "Internal Audit Manager")],
      "co-op": [job(1, "Software Developer Intern"), job(3, "Finance Co-op")],
    });
    const postings = await scrapeCompany("Acme", recipe);
    expect(postings.map((p) => p.title)).toEqual(["Software Developer Intern", "Finance Co-op"]);
    expect(postings[0]).toEqual({
      company: "Acme",
      title: "Software Developer Intern",
      url: `${base}/en-US/Careers/job/1`,
      location: "Toronto, ON",
    });
  });

  it("reads every page", async () => {
    const many = Array.from({ length: 45 }, (_, i) => job(i, `Student ${i}`));
    fakeWorkday({ student: many });
    expect(await scrapeCompany("Acme", recipe)).toHaveLength(45);
  });

  it("stops at the total even if the board keeps serving full pages", async () => {
    const calls: number[] = [];
    vi.stubGlobal("fetch", async (_url: string, init?: RequestInit) => {
      const { offset } = JSON.parse(init?.body as string);
      calls.push(offset);
      const jobPostings = Array.from({ length: 20 }, (_, i) => job(offset + i, `Intern ${offset + i}`));
      return Response.json({ total: offset === 0 ? 30 : 0, jobPostings });
    });
    await scrapeCompany("Acme", recipe);
    expect(calls).toEqual([0, 20, 0, 20, 0, 20]); // two pages for each of the three searches
  });

  it("replaces '2 Locations' with the real places", async () => {
    fakeWorkday(
      { intern: [job(7, "Data Intern", "2 Locations")] },
      { [`${base}/wday/cxs/acme/Careers/job/7`]: { location: "Toronto, ON", additionalLocations: ["New York, NY"] } }
    );
    const [p] = await scrapeCompany("Acme", recipe);
    expect(p?.location).toBe("Toronto, ON; New York, NY");
  });

  it("looks up the place when the board gives no location", async () => {
    fakeWorkday(
      { intern: [{ title: "Editorial Intern", externalPath: "/job/8" }] },
      { [`${base}/wday/cxs/acme/Careers/job/8`]: { location: "London" } }
    );
    const [p] = await scrapeCompany("Acme", recipe);
    expect(p?.location).toBe("London");
  });

  it("returns nothing, without failing, when a live board has no student roles", async () => {
    fakeWorkday({ intern: [job(1, "Senior Engineer")] });
    expect(await scrapeCompany("Acme", recipe)).toEqual([]);
  });

  it("fails when the searches match no jobs at all, so a hiccup can't close postings", async () => {
    fakeWorkday({});
    await expect(scrapeCompany("Acme", recipe)).rejects.toThrow("no jobs at all");
  });

  it("lists a role once when it's on two of the company's boards", async () => {
    vi.stubGlobal("fetch", async () => Response.json({ total: 1, jobPostings: [job(5, "Finance Intern")] }));
    const postings = await scrapeCompany("Acme", { ...recipe, sites: ["Careers", "Campus"] });
    expect(postings.map((p) => p.url)).toEqual([`${base}/en-US/Careers/job/5`]);
  });

  it("keeps paging until a short page when the board gives no total", async () => {
    vi.stubGlobal("fetch", async (_url: string, init?: RequestInit) => {
      const { offset, searchText } = JSON.parse(init?.body as string);
      const all = searchText === "intern" ? Array.from({ length: 30 }, (_, i) => job(i, `Intern ${i}`)) : [];
      return Response.json({ jobPostings: all.slice(offset, offset + 20) });
    });
    expect(await scrapeCompany("Acme", recipe)).toHaveLength(30);
  });

  it("keeps the role when its location lookup fails", async () => {
    fakeWorkday({ intern: [job(9, "Data Intern", "2 Locations")] }); // no detail registered, so the lookup 404s
    const [p] = await scrapeCompany("Acme", recipe);
    expect(p?.location).toBe("2 Locations");
  });

  it("fails when the site doesn't exist, so it can't close postings", async () => {
    vi.stubGlobal("fetch", async () => new Response("not found", { status: 404 }));
    await expect(scrapeCompany("Acme", recipe)).rejects.toThrow("404");
  });
});
