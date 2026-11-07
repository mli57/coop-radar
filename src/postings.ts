/**
 * postings.ts: the posting history behind data/postings.json (R1 in docs/requirements.md).
 *
 * Snapshots only hold what is on each board right now. This keeps every posting we've seen,
 * with when it first appeared and when it closed, so the website can show what's new.
 *
 * 1. postingId: stable id for a posting, from its URL.
 * 2. updateCompany: applies one company's scrape to the history.
 * 3. pruneClosed: drops postings closed for 30+ days so the file stays small.
 *
 * No file reads or writes here, so the rules can be tested directly.
 */

import { createHash } from "node:crypto";
import type { Posting } from "./types.js";

export interface TrackedPosting extends Posting {
  id: string;
  firstSeen: string;
  lastSeen: string;
  closedAt?: string;
  // true if it was already up when we started tracking the company, so its real post date is unknown
  baseline: boolean;
}

const DAY_MS = 24 * 60 * 60 * 1000;

// Same URL always gives the same id. The v2 tracker links to these, so never change the formula.
export function postingId(url: string): string {
  return createHash("sha1").update(url).digest("hex").slice(0, 12);
}

// current = null means the scrape failed: nothing changes, so a broken scraper can't close postings.
// firstRun = true means we just started tracking this company, so its postings are baseline, never "new".
export function updateCompany(
  history: TrackedPosting[],
  company: string,
  current: Posting[] | null,
  firstRun: boolean,
  now: Date
): TrackedPosting[] {
  if (current === null) return history;

  const ts = now.toISOString();
  const onBoard = new Map(current.map((p) => [postingId(p.url), p]));
  const result: TrackedPosting[] = [];

  for (const old of history) {
    if (old.company !== company) {
      result.push(old);
      continue;
    }
    const p = onBoard.get(old.id);
    if (p) {
      // Still up, or back after closing: refresh it and clear closedAt. firstSeen stays, so it's not "new".
      const { closedAt, ...open } = old;
      result.push({ ...open, ...p, lastSeen: ts });
      onBoard.delete(old.id);
    } else {
      result.push(old.closedAt ? old : { ...old, closedAt: ts });
    }
  }

  for (const [id, p] of onBoard) {
    result.push({ ...p, id, firstSeen: ts, lastSeen: ts, baseline: firstRun });
  }
  return result;
}

export function pruneClosed(history: TrackedPosting[], now: Date): TrackedPosting[] {
  return history.filter((p) => !p.closedAt || now.getTime() - Date.parse(p.closedAt) < 30 * DAY_MS);
}
