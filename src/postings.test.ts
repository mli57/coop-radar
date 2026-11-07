import { describe, expect, it } from "vitest";
import { postingId, pruneClosed, updateCompany, type TrackedPosting } from "./postings.js";
import type { Posting } from "./types.js";

const day = (n: number) => new Date(Date.UTC(2026, 10, 1 + n));
const job = (slug: string, company = "Acme"): Posting => ({
  company,
  title: `Software Intern ${slug}`,
  url: `https://jobs.example.com/${company}/${slug}`,
  location: "Toronto, ON",
});

// Runs a sequence of scrapes for Acme, one per day, starting with its first run on day 0.
function runs(...boards: (Posting[] | null)[]): TrackedPosting[] {
  return boards.reduce<TrackedPosting[]>(
    (h, board, i) => updateCompany(h, "Acme", board, i === 0, day(i)),
    []
  );
}

const find = (h: TrackedPosting[], p: Posting) => h.find((t) => t.id === postingId(p.url));

describe("postingId", () => {
  it("is the same for the same URL and different for different URLs", () => {
    expect(postingId(job("a").url)).toBe(postingId(job("a").url));
    expect(postingId(job("a").url)).not.toBe(postingId(job("b").url));
  });
});

describe("updateCompany", () => {
  it("marks postings from a company's first run as baseline", () => {
    const h = runs([job("a")]);
    expect(find(h, job("a"))).toMatchObject({ baseline: true, firstSeen: day(0).toISOString() });
  });

  it("adds a posting that appears on a later run as new, with firstSeen = now", () => {
    const h = runs([job("a")], [job("a"), job("b")]);
    expect(find(h, job("b"))).toMatchObject({
      baseline: false,
      firstSeen: day(1).toISOString(),
      lastSeen: day(1).toISOString(),
    });
    expect(find(h, job("b"))).not.toHaveProperty("closedAt");
  });

  it("updates lastSeen but keeps firstSeen and baseline while a posting stays up", () => {
    const h = runs([job("a")], [job("a")], [job("a")]);
    expect(find(h, job("a"))).toMatchObject({
      baseline: true,
      firstSeen: day(0).toISOString(),
      lastSeen: day(2).toISOString(),
    });
  });

  it("sets closedAt when a posting disappears, and doesn't move it on later runs", () => {
    const h = runs([job("a")], [job("a"), job("b")], [job("a")], [job("a")]);
    expect(find(h, job("b"))).toMatchObject({ closedAt: day(2).toISOString(), lastSeen: day(1).toISOString() });
  });

  it("clears closedAt when a posting comes back, without making it new again", () => {
    const h = runs([job("a")], [job("a"), job("b")], [job("a")], [job("a"), job("b")]);
    const b = find(h, job("b"));
    expect(b).not.toHaveProperty("closedAt");
    expect(b).toMatchObject({ firstSeen: day(1).toISOString(), lastSeen: day(3).toISOString(), baseline: false });
  });

  it("changes nothing when the scrape failed", () => {
    const before = runs([job("a")], [job("a"), job("b")]);
    const after = updateCompany(before, "Acme", null, false, day(2));
    expect(after).toEqual(before);
    expect(after.every((p) => !p.closedAt)).toBe(true);
  });

  it("closes postings when a successful scrape finds an empty board", () => {
    const h = runs([job("a")], []);
    expect(find(h, job("a"))?.closedAt).toBe(day(1).toISOString());
  });

  it("leaves other companies' postings alone", () => {
    const other = updateCompany([], "Globex", [job("x", "Globex")], true, day(0));
    const h = updateCompany(other, "Acme", [job("a")], true, day(1));
    expect(find(h, job("x", "Globex"))).toEqual(other[0]);
  });

  it("does not add the same posting twice if a board lists it twice", () => {
    const h = runs([job("a"), job("a")]);
    expect(h).toHaveLength(1);
  });
});

describe("pruneClosed", () => {
  it("drops postings closed 30+ days ago and keeps open or recently closed ones", () => {
    const h = runs([job("old"), job("recent"), job("open")], [job("recent"), job("open")], [job("open")]);
    // "old" closed on day 1, "recent" closed on day 2. Day 31 is exactly 30 days after day 1.
    const pruned = pruneClosed(h, day(31));
    expect(find(pruned, job("old"))).toBeUndefined();
    expect(find(pruned, job("recent"))).toBeDefined();
    expect(find(pruned, job("open"))).toBeDefined();
  });
});
