import type { Section } from "../lib/group.js";
import { PostingRow } from "./PostingRow.js";

interface Props {
  section: Section;
  now: Date;
  previousVisit: string | null;
}

export function PostingGroup({ section, now, previousVisit }: Props) {
  return (
    <section className="group">
      <h2>{section.label}</h2>
      <ul>
        {section.postings.map((posting) => (
          <PostingRow key={posting.id} posting={posting} now={now} previousVisit={previousVisit} />
        ))}
      </ul>
    </section>
  );
}
