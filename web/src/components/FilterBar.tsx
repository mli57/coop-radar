import { useMemo } from "react";
import { FIELDS, fieldOf } from "../lib/field.js";
import type { Filters } from "../lib/filter.js";
import { placesOf } from "../lib/location.js";
import { compareTerms, termOf } from "../lib/term.js";
import type { TrackedPosting } from "../types.js";
import { SearchSelect } from "./SearchSelect.js";

interface Props {
  postings: TrackedPosting[];
  filters: Filters;
  onChange: (filters: Filters) => void;
  count: number;
}

function Select(props: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  return (
    <select aria-label={props.label} value={props.value} onChange={(e) => props.onChange(e.target.value)}>
      <option value="">{props.label}</option>
      {props.options.map((option) => (
        <option key={option}>{option}</option>
      ))}
    </select>
  );
}

const unique = (values: (string | null)[]) => [...new Set(values.filter((v) => v !== null))];

export function FilterBar({ postings, filters, onChange, count }: Props) {
  const options = useMemo(() => {
    const places = unique(postings.flatMap((p) => placesOf(p.location))).sort();
    const fields = new Set(postings.map((p) => fieldOf(p.title)));
    return {
      companies: unique(postings.map((p) => p.company)).sort((a, b) => a.localeCompare(b)),
      // Remote first, then cities A to Z
      places: places.includes("Remote") ? ["Remote", ...places.filter((p) => p !== "Remote")] : places,
      fields: FIELDS.filter((field) => fields.has(field)),
      terms: unique(postings.map((p) => termOf(p.title))).sort(compareTerms),
    };
  }, [postings]);

  const set = (change: Partial<Filters>) => onChange({ ...filters, ...change });

  return (
    <form className="filters" role="search" onSubmit={(e) => e.preventDefault()}>
      <input
        type="search"
        aria-label="Search title or company"
        placeholder="Search title or company"
        value={filters.query}
        onChange={(e) => set({ query: e.target.value })}
      />
      <SearchSelect label="Company" value={filters.company} options={options.companies} onChange={(company) => set({ company })} />
      <SearchSelect label="Location" value={filters.place} options={options.places} onChange={(place) => set({ place })} />
      <Select label="Field" value={filters.field} options={options.fields} onChange={(field) => set({ field })} />
      <Select label="Term" value={filters.term} options={options.terms} onChange={(term) => set({ term })} />
      <div className="toggles">
        <label>
          <input type="checkbox" checked={filters.canadaOnly} onChange={(e) => set({ canadaOnly: e.target.checked })} />
          Canada and remote only
        </label>
        <label>
          <input type="checkbox" checked={filters.showClosed} onChange={(e) => set({ showClosed: e.target.checked })} />
          Show closed
        </label>
        <output className="count">
          {count} {count === 1 ? "posting" : "postings"}
        </output>
      </div>
    </form>
  );
}
