import { describe, expect, it } from "vitest";
import type { TrackedPosting } from "../types.js";
import { DEFAULT_FILTERS, NOT_STATED, OTHER_PLACE, applyFilters } from "./filter.js";

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
  it("searches location too", () => {
    expect(ids({ query: "toronto" })).toEqual(["toronto"]);
    expect(ids({ query: "san fran", canadaOnly: false })).toEqual(["sf"]);
  });
  it("filters by company", () => {
    expect(ids({ company: "Beta" })).toEqual(["remote"]);
  });
  it("matches part of a company as it's typed", () => {
    expect(ids({ company: "be" })).toEqual(["remote"]);
  });
  it("filters by place, any of several", () => {
    expect(ids({ places: ["Remote"] })).toEqual(["remote"]);
    expect(ids({ places: ["Toronto"] })).toEqual(["toronto"]);
    expect(ids({ places: ["Toronto", "Remote"] })).toEqual(["toronto", "remote"]);
  });
  it("matches a place with or without accents in the posting", () => {
    const montreal = [posting("mtl", { location: "Montréal, QC" })];
    expect(applyFilters(montreal, { ...DEFAULT_FILTERS, places: ["Montreal"] }).map((p) => p.id)).toEqual(["mtl"]);
  });
  it("hides postings with no location when a place is chosen", () => {
    expect(ids({ places: ["Toronto", "Remote"] })).not.toContain("none");
  });
  it("finds postings with no location through Not stated, alone or with a place", () => {
    expect(ids({ places: [NOT_STATED] })).toEqual(["none"]);
    expect(ids({ places: ["Toronto", NOT_STATED] })).toEqual(["toronto", "none"]);
  });
  it("treats a location of only spaces as not stated", () => {
    const blank = [posting("blank", { location: "   " })];
    expect(applyFilters(blank, { ...DEFAULT_FILTERS, canadaOnly: false, places: [NOT_STATED] }).map((p) => p.id)).toEqual(["blank"]);
  });
  it("finds a location with no city button through Other", () => {
    expect(ids({ places: [OTHER_PLACE], canadaOnly: false })).toEqual(["sf"]);
    const ontario = [posting("on", { location: "Ontario, Canada" })];
    expect(applyFilters(ontario, { ...DEFAULT_FILTERS, places: [OTHER_PLACE] }).map((p) => p.id)).toEqual(["on"]);
  });
  it("filters by field", () => {
    expect(ids({ fields: ["Software"] })).toEqual(["toronto"]);
    expect(ids({ fields: ["Data"] })).toEqual(["remote"]);
  });
  it("shows any of several picked fields", () => {
    expect(ids({ fields: ["Software", "Data"] })).toEqual(["toronto", "remote"]);
  });
  it("hides postings with no detected term when a term is chosen", () => {
    expect(ids({ terms: ["Winter 2027"] })).toEqual(["toronto"]);
  });
  it("finds postings with no term through Not stated, alone or with a term", () => {
    expect(ids({ terms: [NOT_STATED] })).toEqual(["remote", "none"]);
    expect(ids({ terms: ["Winter 2027", NOT_STATED] })).toEqual(["toronto", "remote", "none"]);
  });
  it("needs a match in every row of buttons", () => {
    expect(ids({ fields: ["Software", "Data"], terms: [NOT_STATED] })).toEqual(["remote"]);
  });
  it("can leave one row of buttons out, for counting", () => {
    const filters = { ...DEFAULT_FILTERS, fields: ["Data"], terms: ["Winter 2027"] };
    expect(applyFilters(all, filters, "fields").map((p) => p.id)).toEqual(["toronto"]);
    expect(applyFilters(all, filters, "terms").map((p) => p.id)).toEqual(["remote"]);
  });
  it("combines filters", () => {
    expect(ids({ company: "Beta", canadaOnly: false, query: "intern", places: ["Remote"] })).toEqual(["remote"]);
  });
});
