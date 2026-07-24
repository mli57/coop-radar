/**
 * differ.ts: Keeps track of what each company's job board looked like last run, so we can tell what's new this run.
 *
 * The program has no memory between runs. It scrapes, sends alerts, and exits. 
 * At the end of each run, postings are written to data/snapshots/companyname.json.
 * At the start of the next run, old postings are read back to compare against the newly scraped postings
 *
 * 1. loadSnapshot: reads a company's saved postings back from disk.
 * 2. saveSnapshot: overwrites a company's file with the current list of postings on their job board
 * 3. diff: returns the postings in the new list that weren't in the old one. These are what get sent as alerts.
 *
 * Called by monitorCompany() in main.ts, once per company per run.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import type { Posting } from "./types.js";

// path contains each company's job postings
const SNAPSHOT_DIR = "data/snapshots";

// returns a path to the json snapshot of a company(data/snapshots/(company-name).json)
function snapshotPath(company: string): string {
  return `${SNAPSHOT_DIR}/${company.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.json`;
}

// Reads back what this company's board looked like last run. null means company has not been scraped before
export async function loadSnapshot(company: string): Promise<Posting[] | null> {
  let raw: string;
  try { // open the file, no file exist(return null) = first run for this company
    raw = await readFile(snapshotPath(company), "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw err;
  }

  try { // Turn the text into real objects. If the file exists but won't parse, throw error to show corrupted data
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(
      `snapshot ${snapshotPath(company)} is corrupt: ${err instanceof Error ? err.message : err}. ` +
        `Fix the file, or delete it to re-baseline from scratch.`
    );
  }
}

// Overwrites the company's file with the full current board. Creates data/snapshots if this is the first run.
export async function saveSnapshot(company: string, postings: Posting[]): Promise<void> {
  await mkdir(SNAPSHOT_DIR, { recursive: true });
  await writeFile(snapshotPath(company), JSON.stringify(postings, null, 2));
}

// Compare the newest scraped posting with the old snapshot, returns postings that weren't on the snapshot.
export function diff(current: Posting[], previous: Posting[]): Posting[] {
  const seen = new Set(previous.map((p) => p.url));
  return current.filter((p) => !seen.has(p.url));
}
