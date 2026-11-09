import { describe, expect, it } from "vitest";
import { compareTerms, termOf } from "./term.js";

describe("termOf", () => {
  it.each([
    ["Security Intern, Threat Operations - Winter 2027", "Winter 2027"],
    ["Revenue Operations Intern (Winter, 2027)", "Winter 2027"],
    ["SUMMER 2027 Software Intern", "Summer 2027"],
    ["Data Intern fall-2026", "Fall 2026"],
    ["Data Intern Autumn 2026", "Fall 2026"],
    ["Software Engineering Intern - Summer '27", "Summer 2027"],
  ])("reads %s", (title, term) => expect(termOf(title)).toBe(term));

  it.each([
    "Software Engineering Intern 2027 (Toronto)",
    "Software Engineer Intern",
    "Fall/Winter 2026 Intern",
    "Intern, Summer or Fall 2027",
    "Winter Intern",
    "4-8 month Intern",
  ])("leaves %s blank", (title) => expect(termOf(title)).toBeNull());
});

describe("compareTerms", () => {
  it("sorts by year, then season order", () => {
    expect(["Fall 2027", "Summer 2027", "Winter 2027", "Fall 2026"].sort(compareTerms)).toEqual([
      "Fall 2026",
      "Winter 2027",
      "Summer 2027",
      "Fall 2027",
    ]);
  });
});
