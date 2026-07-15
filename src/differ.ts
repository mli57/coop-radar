import { mkdir, readFile, writeFile } from "node:fs/promises";
import type { Posting } from "./types.js";

const SNAPSHOT_DIR = "data/snapshots";

function snapshotPath(company: string): string {
  return `${SNAPSHOT_DIR}/${company.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.json`;
}

// Returns null when no snapshot exists yet (first run — don't alert on the
// whole board, just save the baseline).
export async function loadSnapshot(company: string): Promise<Posting[] | null> {
  try {
    return JSON.parse(await readFile(snapshotPath(company), "utf8"));
  } catch {
    return null;
  }
}

export async function saveSnapshot(company: string, postings: Posting[]): Promise<void> {
  await mkdir(SNAPSHOT_DIR, { recursive: true });
  await writeFile(snapshotPath(company), JSON.stringify(postings, null, 2));
}

// Keyed by URL so reordered listings don't produce false positives.
export function diff(current: Posting[], previous: Posting[]): Posting[] {
  const seen = new Set(previous.map((p) => p.url));
  return current.filter((p) => !seen.has(p.url));
}
