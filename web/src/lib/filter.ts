/** filter.ts: the search boxes, buttons and toggles, applied together. */

import type { TrackedPosting } from "../types.js";
import { fieldOf } from "./field.js";
import { placesOf, showsInCanadaView } from "./location.js";
import { termOf } from "./term.js";

export interface Filters {
  query: string;
  company: string; // "" means any
  places: string[]; // empty means any; several picked means any of them, same for fields and terms
  fields: string[];
  terms: string[]; // NOT_STATED stands for titles with no term
  canadaOnly: boolean;
  showClosed: boolean;
}

export const DEFAULT_FILTERS: Filters = { query: "", company: "", places: [], fields: [], terms: [], canadaOnly: true, showClosed: false };

// Most titles don't say their term, so they get a button of their own instead of vanishing.
export const NOT_STATED = "Not stated";

export const termLabel = (title: string) => termOf(title) ?? NOT_STATED;

// Same for postings with no location, and Other for a location with no city we have a button
// for ("Ontario, Canada"), so picking a city doesn't quietly drop them.
export const OTHER_PLACE = "Other places"; // not just "Other", which Field also has

export function placeLabels(location: string | undefined): string[] {
  if (!location?.trim()) return [NOT_STATED];
  const places = placesOf(location);
  return places.length > 0 ? places : [OTHER_PLACE];
}

// Ignores case and accents, so "montreal" finds "Montréal".
export function containsText(text: string, search: string): boolean {
  const plain = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  return plain(text).includes(plain(search).trim());
}

// skip leaves one button row out, so its buttons can count what picking them would show.
export function applyFilters(postings: TrackedPosting[], filters: Filters, skip?: "places" | "fields" | "terms"): TrackedPosting[] {
  return postings.filter((p) => {
    if (p.closedAt && !filters.showClosed) return false;
    if (filters.canadaOnly && !showsInCanadaView(p.location)) return false;
    if (!containsText(p.company, filters.company)) return false;
    if (skip !== "places" && filters.places.length > 0 && !placeLabels(p.location).some((place) => filters.places.includes(place))) return false;
    if (skip !== "fields" && filters.fields.length > 0 && !filters.fields.includes(fieldOf(p.title))) return false;
    if (skip !== "terms" && filters.terms.length > 0 && !filters.terms.includes(termLabel(p.title))) return false;
    return containsText(p.title, filters.query) || containsText(p.company, filters.query) || containsText(p.location ?? "", filters.query);
  });
}
