import { useEffect, useMemo, useState } from "react";
import { About } from "./components/About.js";
import { FilterBar } from "./components/FilterBar.js";
import { PostingGroup } from "./components/PostingGroup.js";
import { DEFAULT_FILTERS, applyFilters, type Filters } from "./lib/filter.js";
import { buildSections, timeAgo } from "./lib/group.js";
import { readPreviousVisit } from "./lib/lastVisit.js";
import type { Company, TrackedPosting } from "./types.js";

interface Loaded {
  postings: TrackedPosting[];
  updatedAt: string | undefined;
  now: Date;
  previousVisit: string | null;
}

async function fetchData<T>(file: string): Promise<T> {
  const response = await fetch(`${import.meta.env.BASE_URL}data/${file}`, { cache: "no-cache" });
  if (!response.ok) throw new Error(`${file}: ${response.status}`);
  return response.json();
}

export function App() {
  const [data, setData] = useState<Loaded | null>(null);
  const [failed, setFailed] = useState(false);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);

  const [showAbout, setShowAbout] = useState(location.hash === "#about");

  useEffect(() => {
    document.title = showAbout ? "About - coop-radar" : "coop-radar";
  }, [showAbout]);

  useEffect(() => {
    const onHashChange = () => {
      const about = location.hash === "#about";
      setShowAbout(about);
      if (about) window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  useEffect(() => {
    Promise.all([fetchData<TrackedPosting[]>("postings.json"), fetchData<Company[]>("companies.json")])
      .then(([postings, companies]) => {
        const now = new Date();
        const updatedAt = companies.map((c) => c.lastChecked).sort().at(-1);
        setData({ postings, updatedAt, now, previousVisit: readPreviousVisit(now) });
      })
      .catch(() => setFailed(true));
  }, []);

  const visible = useMemo(() => (data ? applyFilters(data.postings, filters) : []), [data, filters]);
  const sections = useMemo(() => (data ? buildSections(visible, data.now) : []), [data, visible]);

  return (
    <>
      <header className="masthead">
        <h1>
          <a href="#">coop-radar</a>
        </h1>
        {data?.updatedAt && <span className="updated">Updated {timeAgo(data.updatedAt, data.now)}</span>}
        {showAbout ? <a href="#">Postings</a> : <a href="#about">About</a>}
      </header>

      {showAbout ? (
        <About />
      ) : (
        <main>
          {failed && <p className="message">Postings could not be loaded. Refresh the page to try again.</p>}
          {!failed && !data && <p className="message">Loading postings</p>}
          {data && (
            <>
              <FilterBar postings={data.postings} filters={filters} onChange={setFilters} count={visible.length} />
              {visible.length === 0 ? (
                <p className="message">
                  No postings match these filters.{" "}
                  <button type="button" className="text-button" onClick={() => setFilters(DEFAULT_FILTERS)}>
                    Clear filters
                  </button>
                </p>
              ) : (
                <>
                  <div className="columns" aria-hidden="true">
                    <span>First seen</span>
                    <span>Role</span>
                    <span>Field</span>
                    <span>Company</span>
                    <span>Location</span>
                  </div>
                  {sections.map((section) => (
                    <PostingGroup key={section.label} section={section} now={data.now} previousVisit={data.previousVisit} />
                  ))}
                </>
              )}
            </>
          )}
        </main>
      )}
    </>
  );
}
