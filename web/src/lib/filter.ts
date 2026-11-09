/** filter.ts: the search boxes, dropdowns and toggles, applied together. */

import type { TrackedPosting } from "../types.js";
import { fieldOf } from "./field.js";
import { showsInCanadaView } from "./location.js";
import { termOf } from "./term.js";

export interface Filters {
  query: string;
  company: string; // "" means any, same for place, field and term
  place: string;
  field: string;
  term: string;
  canadaOnly: boolean;
  showClosed: boolean;
}

export const DEFAULT_FILTERS: Filters = { query: "", company: "", place: "", field: "", term: "", canadaOnly: true, showClosed: false };

// Ignores case and accents, so "montreal" finds "Montréal".
export function containsText(text: string, search: string): boolean {
  const plain = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  return plain(text).includes(plain(search).trim());
}

export function applyFilters(postings: TrackedPosting[], filters: Filters): TrackedPosting[] {
  return postings.filter((p) => {
    if (p.closedAt && !filters.showClosed) return false;
    if (filters.canadaOnly && !showsInCanadaView(p.location)) return false;
    if (!containsText(p.company, filters.company)) return false;
    if (filters.place && !containsText(p.location ?? "", filters.place)) return false;
    if (filters.field && fieldOf(p.title) !== filters.field) return false;
    if (filters.term && termOf(p.title) !== filters.term) return false;
    return containsText(p.title, filters.query) || containsText(p.company, filters.query);
  });
}
