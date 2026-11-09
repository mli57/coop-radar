import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrackedPosting } from "../types.js";
import { isNewSince, readPreviousVisit } from "./lastVisit.js";

describe("readPreviousVisit", () => {
  const hour = (h: number, minute = 0) => new Date(Date.UTC(2026, 10, 9, h, minute));

  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
    });
  });

  it("is null on a first visit, including a refresh of it", () => {
    expect(readPreviousVisit(hour(9))).toBeNull();
    expect(readPreviousVisit(hour(9, 5))).toBeNull();
  });

  it("returns the last visit when someone comes back", () => {
    readPreviousVisit(hour(9));
    expect(readPreviousVisit(hour(12))).toBe(hour(9).toISOString());
  });

  it("keeps the same answer across refreshes", () => {
    readPreviousVisit(hour(9));
    readPreviousVisit(hour(12));
    expect(readPreviousVisit(hour(12, 10))).toBe(hour(9).toISOString());
  });

  it("moves on for a later visit, even from a tab left open for days", () => {
    readPreviousVisit(hour(9));
    readPreviousVisit(hour(12));
    expect(readPreviousVisit(hour(15))).toBe(hour(12).toISOString());
  });

  it("shows no badges when storage is blocked", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
    });
    expect(readPreviousVisit(hour(9))).toBeNull();
  });
});

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

const before = "2026-11-09T11:00:00.000Z";
const after = "2026-11-09T13:00:00.000Z";

describe("isNewSince", () => {
  it("is new when first seen after the last visit", () => expect(isNewSince(posting({}), before)).toBe(true));
  it("is not new when first seen before the last visit", () => expect(isNewSince(posting({}), after)).toBe(false));
  it("is never new on a first visit", () => expect(isNewSince(posting({}), null)).toBe(false));
  it("is never new for baseline postings", () => expect(isNewSince(posting({ baseline: true }), before)).toBe(false));
  it("is never new for closed postings", () => {
    expect(isNewSince(posting({ closedAt: "2026-11-09T12:30:00.000Z" }), before)).toBe(false);
  });
});
