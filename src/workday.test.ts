import { afterEach, describe, expect, it, vi } from "vitest";
import { findWorkday } from "./agent.js";
import { canadaFilter, scrapeCompany } from "./scraper.js";

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

describe("canadaFilter", () => {
  it("prefers a country-wide Canada option", () => {
    const facets = [
      { facetParameter: "Country", values: [{ descriptor: "United States", id: "us" }, { descriptor: "Canada", id: "ca" }] },
      { facetParameter: "Location", values: [{ descriptor: "Toronto, Canada", id: "tor" }] },
    ];
    expect(canadaFilter(facets)).toEqual({ Country: ["ca"] });
  });

  it("finds the option inside a group of filters", () => {
    const facets = [
      {
        facetParameter: "locationMainGroup",
        values: [{ facetParameter: "locationCountry", values: [{ descriptor: "Canada", id: "ca" }] }],
      },
    ];
    expect(canadaFilter(facets)).toEqual({ locationCountry: ["ca"] });
  });

  it("falls back to every Canadian office, skipping La Canada in California", () => {
    const facets = [
      {
        facetParameter: "locations",
        values: [
          { descriptor: "Canada, Toronto", id: "tor" },
          { descriptor: "Mississauga Ontario Canada", id: "mis" },
          { descriptor: "La Canada Flintridge California United States", id: "la" },
          { descriptor: "USA, Austin", id: "aus" },
        ],
      },
    ];
    expect(canadaFilter(facets)).toEqual({ locations: ["tor", "mis"] });
  });

  it("recognises offices that don't say Canada, like a city or an RTX site code", () => {
    const facets = [
      {
        facetParameter: "locations",
        values: [
          { descriptor: "Calgary", id: "cal" },
          { descriptor: "CA-QC-LONGUEUIL-J01 ~ 1000 Blvd Marie-Victorin", id: "lon" },
          { descriptor: "Ontario, CA", id: "ontario-california" },
          { descriptor: "Kuala Lumpur", id: "kl" },
        ],
      },
    ];
    expect(canadaFilter(facets)).toEqual({ locations: ["cal", "lon"] });
  });

  it("ignores filters that aren't places, and reads the whole board when it has no location filter", () => {
    const facets = [{ facetParameter: "jobFamilyGroup", values: [{ descriptor: "Toronto Maple Leafs", id: "tml" }] }];
    expect(canadaFilter(facets)).toEqual({});
  });

  it("returns null when the board has no Canadian jobs", () => {
    expect(canadaFilter([{ facetParameter: "Country", values: [{ descriptor: "Germany", id: "de" }] }])).toBeNull();
  });
});

describe("Workday scraping", () => {
  afterEach(() => vi.unstubAllGlobals());

  const recipe = { type: "workday" as const, tenant: "acme", wdInstance: "wd3", sites: ["Careers"] };
  const base = "https://acme.wd3.myworkdayjobs.com";
  const job = (n: number, title: string, locationsText = "Toronto, ON") => ({ title, externalPath: `/job/${n}`, locationsText });
  const CANADA_FACETS = [{ facetParameter: "Country", values: [{ descriptor: "Canada", id: "ca" }] }];

  // Fakes Workday: an unfiltered search returns the filter options, a Canada-filtered one returns `jobs`
  // 20 per page. Any other filter finds nothing.
  type Job = { title: string; externalPath: string; locationsText?: string };
  function fakeWorkday(jobs: Job[], details: Record<string, unknown> = {}, facets: unknown[] = CANADA_FACETS) {
    const calls: unknown[] = [];
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        const { appliedFacets, offset, limit } = JSON.parse(init.body as string);
        calls.push(appliedFacets);
        if (Object.keys(appliedFacets).length === 0) return Response.json({ total: jobs.length + 5, facets, jobPostings: [] });
        const found = appliedFacets.Country?.[0] === "ca" ? jobs : [];
        return Response.json({ total: found.length, jobPostings: found.slice(offset, offset + limit) });
      }
      const detail = details[url];
      return detail ? Response.json({ jobPostingInfo: detail }) : new Response("", { status: 404 });
    });
    return calls;
  }

  it("reads only the Canadian jobs and keeps the student titles, with the posting's own URL", async () => {
    const calls = fakeWorkday([job(1, "Software Developer Intern"), job(2, "Internal Audit Manager"), job(3, "Finance Co-op")]);
    const postings = await scrapeCompany("Acme", recipe);
    expect(calls).toEqual([{}, { Country: ["ca"] }]);
    expect(postings.map((p) => p.title)).toEqual(["Software Developer Intern", "Finance Co-op"]);
    expect(postings[0]).toEqual({
      company: "Acme",
      title: "Software Developer Intern",
      url: `${base}/en-US/Careers/job/1`,
      location: "Toronto, ON",
    });
  });

  it("reads every page", async () => {
    fakeWorkday(Array.from({ length: 45 }, (_, i) => job(i, `Student ${i}`)));
    expect(await scrapeCompany("Acme", recipe)).toHaveLength(45);
  });

  it("stops at the total even if the board keeps serving full pages", async () => {
    const offsets: number[] = [];
    vi.stubGlobal("fetch", async (_url: string, init?: RequestInit) => {
      const { offset, appliedFacets } = JSON.parse(init?.body as string);
      if (Object.keys(appliedFacets).length === 0) return Response.json({ total: 100, facets: CANADA_FACETS, jobPostings: [] });
      offsets.push(offset);
      const jobPostings = Array.from({ length: 20 }, (_, i) => job(offset + i, `Intern ${offset + i}`));
      return Response.json({ total: offset === 0 ? 30 : 0, jobPostings });
    });
    await scrapeCompany("Acme", recipe);
    expect(offsets).toEqual([0, 20]);
  });

  it("replaces '2 Locations' with the real places", async () => {
    fakeWorkday(
      [job(7, "Data Intern", "2 Locations")],
      { [`${base}/wday/cxs/acme/Careers/job/7`]: { location: "Toronto, ON", additionalLocations: ["New York, NY"] } }
    );
    const [p] = await scrapeCompany("Acme", recipe);
    expect(p?.location).toBe("Toronto, ON; New York, NY");
  });

  it("looks up the place when the board gives no location", async () => {
    fakeWorkday(
      [{ title: "Editorial Intern", externalPath: "/job/8" }],
      { [`${base}/wday/cxs/acme/Careers/job/8`]: { location: "Toronto" } }
    );
    const [p] = await scrapeCompany("Acme", recipe);
    expect(p?.location).toBe("Toronto");
  });

  it("returns nothing, without failing, when a live board has no student roles", async () => {
    fakeWorkday([job(1, "Senior Engineer")]);
    expect(await scrapeCompany("Acme", recipe)).toEqual([]);
  });

  it("returns nothing, without failing, when a live board has no Canadian jobs", async () => {
    const calls = fakeWorkday([], {}, [{ facetParameter: "Country", values: [{ descriptor: "Germany", id: "de" }] }]);
    expect(await scrapeCompany("Acme", recipe)).toEqual([]);
    expect(calls).toEqual([{}]); // no filtered search
  });

  it("fails when the site has no jobs at all, so a hiccup can't close postings", async () => {
    vi.stubGlobal("fetch", async () => Response.json({ total: 0, jobPostings: [] }));
    await expect(scrapeCompany("Acme", recipe)).rejects.toThrow("no jobs at all");
  });

  it("lists a role once when it's on two of the company's boards", async () => {
    fakeWorkday([job(5, "Finance Intern")]);
    const postings = await scrapeCompany("Acme", { ...recipe, sites: ["Careers", "Campus"] });
    expect(postings.map((p) => p.url)).toEqual([`${base}/en-US/Careers/job/5`]);
  });

  it("keeps paging until a short page when the board gives no total", async () => {
    vi.stubGlobal("fetch", async (_url: string, init?: RequestInit) => {
      const { offset, appliedFacets } = JSON.parse(init?.body as string);
      if (Object.keys(appliedFacets).length === 0) return Response.json({ facets: CANADA_FACETS, jobPostings: [job(0, "x")] });
      const all = Array.from({ length: 30 }, (_, i) => job(i, `Intern ${i}`));
      return Response.json({ jobPostings: all.slice(offset, offset + 20) });
    });
    expect(await scrapeCompany("Acme", recipe)).toHaveLength(30);
  });

  it("keeps the role when its location lookup fails", async () => {
    fakeWorkday([job(9, "Data Intern", "2 Locations")]); // no detail registered, so the lookup 404s
    const [p] = await scrapeCompany("Acme", recipe);
    expect(p?.location).toBe("2 Locations");
  });

  it("fails when the site doesn't exist, so it can't close postings", async () => {
    vi.stubGlobal("fetch", async () => new Response("not found", { status: 404 }));
    await expect(scrapeCompany("Acme", recipe)).rejects.toThrow("404");
  });
});
