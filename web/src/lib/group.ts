/**
 * group.ts: turns postings into the sections the board shows, and formats times.
 * Days follow the visitor's own clock, so "Today" means their today.
 */

import type { TrackedPosting } from "../types.js";

export interface Section {
  label: string;
  postings: TrackedPosting[];
}

export const BASELINE_LABEL = "Already open when tracking began";

const startOfDay = (d: Date, offsetDays = 0) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + offsetDays).getTime();

export function shortDate(iso: string, now: Date): string {
  const date = new Date(iso);
  const options: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  if (date.getFullYear() !== now.getFullYear()) options.year = "numeric";
  return date.toLocaleDateString("en-CA", options).replace(".", "");
}

export function dayLabel(iso: string, now: Date): string {
  const day = startOfDay(new Date(iso));
  if (day === startOfDay(now)) return "Today";
  if (day === startOfDay(now, -1)) return "Yesterday";
  return shortDate(iso, now);
}

export function timeAgo(iso: string, now: Date): string {
  const minutes = Math.floor((now.getTime() - Date.parse(iso)) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 60 * 24) return `${Math.floor(minutes / 60)}h ago`;
  return `${Math.floor(minutes / (60 * 24))}d ago`;
}

// 0 for a brand new posting, rising to 1 at a week old. Drives the fading age column.
export function ageFade(iso: string, now: Date): number {
  const week = 7 * 24 * 60 * 60 * 1000;
  return Math.min(Math.max((now.getTime() - Date.parse(iso)) / week, 0), 1);
}

// Newest first, in day groups, with baseline postings in their own group at the bottom.
export function buildSections(postings: TrackedPosting[], now: Date): Section[] {
  const sorted = [...postings].sort(
    (a, b) => Date.parse(b.firstSeen) - Date.parse(a.firstSeen) || a.company.localeCompare(b.company) || a.title.localeCompare(b.title)
  );

  const sections: Section[] = [];
  for (const posting of sorted.filter((p) => !p.baseline)) {
    const label = dayLabel(posting.firstSeen, now);
    const last = sections.at(-1);
    if (last?.label === label) last.postings.push(posting);
    else sections.push({ label, postings: [posting] });
  }

  const baseline = sorted.filter((p) => p.baseline);
  if (baseline.length > 0) sections.push({ label: BASELINE_LABEL, postings: baseline });
  return sections;
}
