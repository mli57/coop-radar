import { describe, expect, it } from "vitest";
import type { TrackedPosting } from "../types.js";
import { DEFAULT_FILTERS, applyFilters } from "./filter.js";

const posting = (id: string, over: Partial<TrackedPosting>): TrackedPosting => ({
  company: "Acme",
  title: "Intern",
  url: `https://example.com/${id}`,
  id,
  firstSeen: "2026-11-09T12:00:00.000Z",
  lastSeen: "2026-11-09T12:00:00.000Z",
  baseline: false,
  location: "Toronto",
  ...over,
});

const all = [
  posting("toronto", { title: "Software Intern - Winter 2027" }),
  posting("sf", { location: "San Francisco, CA", company: "Beta" }),
  posting("remote", { location: "Remote, Canada", company: "Beta", title: "Data Intern" }),
  posting("none", { company: "Gamma", location: "" }),
  posting("closed", { closedAt: "2026-11-09T13:00:00.000Z" }),
];

const ids = (over: Partial<typeof DEFAULT_FILTERS>) => applyFilters(all, { ...DEFAULT_FILTERS, ...over }).map((p) => p.id);

describe("applyFilters", () => {
  it("defaults to open Canadian, remote and unknown-location postings", () => {
    expect(ids({})).toEqual(["toronto", "remote", "none"]);
  });
  it("shows everything open when Canada only is off", () => {
    expect(ids({ canadaOnly: false })).toEqual(["toronto", "sf", "remote", "none"]);
  });
  it("adds closed postings when asked", () => {
    expect(ids({ showClosed: true })).toContain("closed");
  });
  it("searches titles and companies, ignoring case and spaces", () => {
    expect(ids({ query: "  DATA " })).toEqual(["remote"]);
    expect(ids({ query: "gamma" })).toEqual(["none"]);
  });
  it("does not search location", () => {
    expect(ids({ query: "toronto" })).toEqual([]);
  });
  it("filters by company", () => {
    expect(ids({ company: "Beta" })).toEqual(["remote"]);
  });
  it("filters by place", () => {
    expect(ids({ place: "Remote" })).toEqual(["remote"]);
    expect(ids({ place: "Toronto" })).toEqual(["toronto"]);
  });
  it("matches part of a company or place as it's typed", () => {
    expect(ids({ company: "be" })).toEqual(["remote"]);
    expect(ids({ place: "toro" })).toEqual(["toronto"]);
  });
  it("finds places that aren't in the list once Canada only is off", () => {
    expect(ids({ place: "san fran", canadaOnly: false })).toEqual(["sf"]);
  });
  it("ignores accents when matching a place", () => {
    const montreal = [posting("mtl", { location: "Montréal, QC" })];
    expect(applyFilters(montreal, { ...DEFAULT_FILTERS, place: "Montreal" }).map((p) => p.id)).toEqual(["mtl"]);
  });
  it("hides postings with no location when a place is chosen", () => {
    expect(ids({ place: "o" })).not.toContain("none");
  });
  it("filters by field", () => {
    expect(ids({ field: "Software" })).toEqual(["toronto"]);
    expect(ids({ field: "Data" })).toEqual(["remote"]);
  });
  it("hides postings with no detected term when a term is chosen", () => {
    expect(ids({ term: "Winter 2027" })).toEqual(["toronto"]);
  });
  it("combines filters", () => {
    expect(ids({ company: "Beta", canadaOnly: false, query: "intern", place: "Remote" })).toEqual(["remote"]);
  });
});
