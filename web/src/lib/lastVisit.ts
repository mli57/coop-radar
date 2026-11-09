/**
 * lastVisit.ts: the "new since your last visit" badge. Stored only in this browser.
 * Storage can be blocked (private windows), and then no badges show.
 */

import type { TrackedPosting } from "../types.js";

const LAST_LOAD = "coop-radar:lastLoad";
const PREVIOUS_VISIT = "coop-radar:previousVisit";
const SAME_VISIT_MS = 30 * 60 * 1000;

// Returns when the visitor was last here, or null on a first visit.
// Loads less than 30 minutes apart count as one visit, so refreshing doesn't clear the badges.
export function readPreviousVisit(now: Date): string | null {
  try {
    const lastLoad = localStorage.getItem(LAST_LOAD);
    const sameVisit = lastLoad !== null && now.getTime() - Date.parse(lastLoad) < SAME_VISIT_MS;
    if (!sameVisit) localStorage.setItem(PREVIOUS_VISIT, lastLoad ?? "");
    localStorage.setItem(LAST_LOAD, now.toISOString());
    return localStorage.getItem(PREVIOUS_VISIT) || null;
  } catch {
    return null;
  }
}

// Baseline postings were never seen appearing, so they can't be new.
export function isNewSince(posting: TrackedPosting, previousVisit: string | null): boolean {
  if (!previousVisit || posting.baseline || posting.closedAt) return false;
  return Date.parse(posting.firstSeen) > Date.parse(previousVisit);
}
