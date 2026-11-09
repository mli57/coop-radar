import type { CSSProperties } from "react";
import { fieldOf } from "../lib/field.js";
import { ageFade, shortDate, timeAgo } from "../lib/group.js";
import { isNewSince } from "../lib/lastVisit.js";
import type { TrackedPosting } from "../types.js";

interface Props {
  posting: TrackedPosting;
  now: Date;
  previousVisit: string | null;
}

export function PostingRow({ posting, now, previousVisit }: Props) {
  const { company, title, url, location, baseline, firstSeen, closedAt } = posting;
  // Baseline postings have no known post date, so they get no age and no fading edge.
  const className = ["posting", closedAt && "closed", !baseline && !closedAt && "tracked"].filter(Boolean).join(" ");
  const fade = { "--age": ageFade(firstSeen, now) } as CSSProperties;

  return (
    <li className={className} style={fade} data-testid="posting">
      <span className="title">
        {isNewSince(posting, previousVisit) && <span className="new">New</span>}
        {title}
      </span>
      <span className="details">
        <span className="company">{company}</span>
        <span className="location">{location}</span>
        <span className="field">{fieldOf(title)}</span>
        <span className="age">
          {!baseline && (
            <>
              <span className="seen">First seen </span>
              {timeAgo(firstSeen, now)}
            </>
          )}
        </span>
      </span>
      <span className="action">
        {closedAt ? (
          `Closed ${shortDate(closedAt, now)}`
        ) : /^https?:\/\//i.test(url) ? (
          <a href={url} target="_blank" rel="noopener noreferrer">
            Apply<span className="visually-hidden"> to {title} at {company}</span>
          </a>
        ) : null}
      </span>
    </li>
  );
}
