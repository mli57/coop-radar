import { useId, useMemo, useRef } from "react";
import { FIELDS, fieldOf } from "../lib/field.js";
import { DEFAULT_FILTERS, NOT_STATED, OTHER_PLACE, applyFilters, placeLabels, termLabel, type Filters } from "../lib/filter.js";
import { compareTerms } from "../lib/term.js";
import type { TrackedPosting } from "../types.js";
import { SearchSelect } from "./SearchSelect.js";

interface Props {
  postings: TrackedPosting[];
  filters: Filters;
  onChange: (filters: Filters) => void;
  count: number;
}

// A row of buttons that switch on and off. Several can be on; none on means any.
// Each shows how many postings it matches given the other filters, and greys out at 0.
// Once something in the row is on, the others add to the list, so their counts read "+9".
// added: how many each would add, when that differs from its count (a posting in two places).
function ButtonRow(props: {
  label: string;
  picked: string[];
  options: string[];
  counts: Map<string, number>;
  added?: Map<string, number>;
  onChange: (picked: string[]) => void;
}) {
  const labelId = useId();
  const toggle = (option: string) =>
    props.onChange(props.picked.includes(option) ? props.picked.filter((p) => p !== option) : [...props.picked, option]);
  if (props.options.length === 0) return null;
  return (
    <div className="button-row" role="group" aria-labelledby={labelId}>
      <span className="button-row-label" id={labelId}>
        {props.label}
      </span>
      <div className="choices">
        {props.options.map((option) => {
          const on = props.picked.includes(option);
          const count = props.counts.get(option) ?? 0;
          const adds = !on && props.picked.length > 0 && count > 0;
          const addCount = (props.added ?? props.counts).get(option) ?? 0;
          // aria-disabled, not disabled: a button switched off at 0 greys out while focused,
          // and a disabled button would drop keyboard focus to the page.
          const dead = !on && count === 0;
          return (
            <button
              key={option}
              type="button"
              // "+0" is drawn differently so it doesn't look like it will change the list, but stays clickable
              className={adds && addCount === 0 ? "choice adds-nothing" : "choice"}
              aria-pressed={on}
              aria-disabled={dead}
              // So "+18" doesn't read as "18 new"
              title={adds ? `Adds ${addCount} to the list` : `${count} ${count === 1 ? "posting" : "postings"}`}
              onClick={() => dead || toggle(option)}
            >
              {option} <span className="choice-count">{adds ? `+${addCount}` : count}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

const tally = (values: string[]) => {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return counts;
};

const unique = (values: (string | null)[]) => [...new Set(values.filter((v) => v !== null))];

export function FilterBar({ postings, filters, onChange, count }: Props) {
  const { canadaOnly, showClosed } = filters;
  // Buttons only offer what the two checkboxes let through, so closed or American-only terms
  // don't sit there at 0. A picked button always stays, so it can be switched off.
  const inView = useMemo(() => applyFilters(postings, { ...DEFAULT_FILTERS, canadaOnly, showClosed }), [postings, canadaOnly, showClosed]);
  const options = useMemo(() => {
    // Remote first, then the places with the most postings, so the useful ones lead the row.
    // Other and Not stated go last, like in Term.
    const perPlace = tally(inView.flatMap((p) => placeLabels(p.location)));
    const last = (place: string) => [OTHER_PLACE, NOT_STATED].indexOf(place);
    const places = unique([...perPlace.keys(), ...filters.places]).sort(
      (a, b) =>
        last(a) - last(b) ||
        Number(b === "Remote") - Number(a === "Remote") ||
        (perPlace.get(b) ?? 0) - (perPlace.get(a) ?? 0) ||
        a.localeCompare(b)
    );
    const fields = new Set([...inView.map((p) => fieldOf(p.title)), ...filters.fields]);
    const terms = new Set([...inView.map((p) => termLabel(p.title)), ...filters.terms]);
    return {
      companies: unique(postings.map((p) => p.company)).sort((a, b) => a.localeCompare(b)),
      places,
      fields: FIELDS.filter((field) => fields.has(field)),
      terms: [...[...terms].filter((t) => t !== NOT_STATED).sort(compareTerms), ...(terms.has(NOT_STATED) ? [NOT_STATED] : [])],
    };
  }, [postings, inView, filters.places, filters.fields, filters.terms]);

  const counts = useMemo(() => {
    // A posting can be in several places, so a place's "+N" only counts postings not already
    // on the list through a picked place. It can be +0 and still be picked.
    const nearby = applyFilters(postings, filters, "places");
    return {
      places: tally(nearby.flatMap((p) => placeLabels(p.location))),
      placesAdded: tally(nearby.filter((p) => !placeLabels(p.location).some((place) => filters.places.includes(place))).flatMap((p) => placeLabels(p.location))),
      fields: tally(applyFilters(postings, filters, "fields").map((p) => fieldOf(p.title))),
      terms: tally(applyFilters(postings, filters, "terms").map((p) => termLabel(p.title))),
    };
  }, [postings, filters]);

  const set = (change: Partial<Filters>) => onChange({ ...filters, ...change });
  const search = useRef<HTMLInputElement>(null);

  return (
    <form className="filters" role="search" onSubmit={(e) => e.preventDefault()}>
      <input
        ref={search}
        type="search"
        aria-label="Search title, company or location"
        placeholder="Search title, company or location"
        value={filters.query}
        onChange={(e) => set({ query: e.target.value })}
      />
      <SearchSelect label="Company" value={filters.company} options={options.companies} onChange={(company) => set({ company })} />
      <ButtonRow label="Location" picked={filters.places} options={options.places} counts={counts.places} added={counts.placesAdded} onChange={(places) => set({ places })} />
      <ButtonRow label="Field" picked={filters.fields} options={options.fields} counts={counts.fields} onChange={(fields) => set({ fields })} />
      <ButtonRow label="Term" picked={filters.terms} options={options.terms} counts={counts.terms} onChange={(terms) => set({ terms })} />
      <div className="toggles">
        <label>
          <input type="checkbox" checked={filters.canadaOnly} onChange={(e) => set({ canadaOnly: e.target.checked })} />
          Canada and remote only
        </label>
        <label>
          <input type="checkbox" checked={filters.showClosed} onChange={(e) => set({ showClosed: e.target.checked })} />
          Show closed
        </label>
        {/* Before the count, so the count doesn't move when this appears.
            At 0 the "No postings match" message has its own Clear filters.
            Spaces alone in the search box don't filter anything, so they don't count. */}
        {count > 0 && JSON.stringify({ ...filters, query: filters.query.trim() }) !== JSON.stringify(DEFAULT_FILTERS) && (
          <button
            type="button"
            className="text-button"
            onClick={() => {
              onChange(DEFAULT_FILTERS);
              search.current?.focus(); // the button disappears, so keep the keyboard somewhere useful
            }}
          >
            Clear filters
          </button>
        )}
        <output className="count">
          {count} {count === 1 ? "posting" : "postings"}
        </output>
      </div>
    </form>
  );
}
