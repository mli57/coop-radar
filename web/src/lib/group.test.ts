import { describe, expect, it } from "vitest";
import type { TrackedPosting } from "../types.js";
import { BASELINE_LABEL, ageFade, buildSections, dayLabel, shortDate, timeAgo } from "./group.js";

const posting = (over: Partial<TrackedPosting>): TrackedPosting => ({
  company: "Acme",
  title: "Intern",
  url: "https://example.com/1",
  id: "1",
  firstSeen: "2026-11-09T12:00:00.000Z",
  lastSeen: "2026-11-09T12:00:00.000Z",
  baseline: false,
  ...over,
});

// Local Toronto times, set in vite.config.ts
const at = (month: number, day: number, hour: number, minute = 0) => new Date(2026, month - 1, day, hour, minute);

describe("dayLabel", () => {
  const now = at(11, 9, 10);

  it("uses the local day, not the UTC day", () => {
    // 11:30pm Nov 8 in Toronto is already Nov 9 in UTC
    expect(dayLabel(at(11, 8, 23, 30).toISOString(), now)).toBe("Yesterday");
  });
  it("calls the first minute of today Today", () => {
    expect(dayLabel(at(11, 9, 0, 0).toISOString(), now)).toBe("Today");
  });
  it("calls the last minute of yesterday Yesterday", () => {
    expect(dayLabel(at(11, 8, 23, 59).toISOString(), now)).toBe("Yesterday");
  });
  it("uses a date further back", () => {
    expect(dayLabel(at(11, 5, 12).toISOString(), now)).toBe("Nov 5");
  });
  it("handles the day the clocks change", () => {
    // Nov 1 2026 is 25 hours long in Toronto
    expect(dayLabel(at(10, 31, 23, 30).toISOString(), at(11, 1, 23, 30))).toBe("Yesterday");
    expect(dayLabel(at(11, 1, 0, 30).toISOString(), at(11, 1, 23, 30))).toBe("Today");
  });
  it("crosses a new year", () => {
    expect(dayLabel(new Date(2026, 11, 31, 20).toISOString(), new Date(2027, 0, 1, 9))).toBe("Yesterday");
  });
});

describe("shortDate", () => {
  it("adds the year only when it isn't this year", () => {
    expect(shortDate(at(11, 5, 12).toISOString(), at(11, 9, 10))).toBe("Nov 5");
    expect(shortDate(new Date(2025, 10, 5, 12).toISOString(), at(11, 9, 10))).toBe("Nov 5, 2025");
  });
});

describe("timeAgo", () => {
  const now = at(11, 9, 10);
  it.each([
    [at(11, 9, 9, 59, ), "1m ago"],
    [at(11, 9, 9, 15), "45m ago"],
    [at(11, 9, 7), "3h ago"],
    [at(11, 7, 10), "2d ago"],
    [now, "just now"],
  ])("formats %s", (date, text) => expect(timeAgo(date.toISOString(), now)).toBe(text));
});

describe("ageFade", () => {
  const now = at(11, 9, 10);
  it("starts at 0, stops at 1", () => {
    expect(ageFade(now.toISOString(), now)).toBe(0);
    expect(ageFade(at(10, 1, 10).toISOString(), now)).toBe(1);
  });
});

describe("buildSections", () => {
  const now = at(11, 9, 10);

  it("sorts newest first inside day groups", () => {
    const sections = buildSections(
      [
        posting({ id: "old", firstSeen: at(11, 5, 12).toISOString() }),
        posting({ id: "morning", firstSeen: at(11, 9, 6).toISOString() }),
        posting({ id: "late", firstSeen: at(11, 9, 9).toISOString() }),
        posting({ id: "yest", firstSeen: at(11, 8, 9).toISOString() }),
      ],
      now
    );
    expect(sections.map((s) => [s.label, s.postings.map((p) => p.id)])).toEqual([
      ["Today", ["late", "morning"]],
      ["Yesterday", ["yest"]],
      ["Nov 5", ["old"]],
    ]);
  });

  it("puts baseline postings last, even when they look newest", () => {
    const sections = buildSections(
      [posting({ id: "base", baseline: true, firstSeen: at(11, 9, 9).toISOString() }), posting({ id: "real", firstSeen: at(11, 5, 12).toISOString() })],
      now
    );
    expect(sections.map((s) => s.label)).toEqual(["Nov 5", BASELINE_LABEL]);
  });

  it("makes no baseline group when there are none", () => {
    expect(buildSections([posting({})], now).map((s) => s.label)).toEqual(["Today"]);
  });
});
