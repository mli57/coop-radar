import { useState, type FormEvent } from "react";
import type { Company } from "../types.js";

const NEW_ISSUE = "https://github.com/mli57/coop-radar/issues/new";

const STATUS_LABEL: Record<Company["status"], string> = {
  ok: "Working",
  broken: "Broken",
  "no-recipe": "Not set up yet",
};

interface Props {
  companies: Company[];
}

export function Companies({ companies }: Props) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");

  const sorted = [...companies].sort((a, b) => a.name.localeCompare(b.name));
  const count = (status: Company["status"]) => companies.filter((c) => c.status === status).length;

  // Opens the "Request a company" issue form with what was typed already filled in.
  const request = (event: FormEvent) => {
    event.preventDefault();
    const params = new URLSearchParams({ template: "request-company.yml", title: `Request: ${name.trim()}`, company: name.trim(), url: url.trim() });
    window.open(`${NEW_ISSUE}?${params}`, "_blank", "noopener");
  };

  return (
    <section className="companies">
      <h2>Companies</h2>
      <p className="summary">
        {companies.length} tracked: {count("ok")} working, {count("broken")} broken, {count("no-recipe")} not set up yet.
        Broken means the last check failed, so its postings may be out of date.
      </p>

      <form className="request" onSubmit={request}>
        <h3>Request a company</h3>
        <label>
          Company name
          <input value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        <label>
          Careers page URL
          <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" />
        </label>
        <button type="submit">Request on GitHub</button>
      </form>

      <div className="company-columns" aria-hidden="true">
        <span>Company</span>
        <span>Status</span>
        <span>Open</span>
        <span>Careers page</span>
      </div>
      <ul>
        {sorted.map((c) => (
          <li key={c.name} className={`company-row ${c.status}`} data-testid="company">
            <span className="company-name">{c.name}</span>
            <span className="status">{STATUS_LABEL[c.status]}</span>
            <span className="open">
              {c.openCount}
              <span className="seen"> open</span>
            </span>
            <span className="careers">
              {/^https?:\/\//i.test(c.careersUrl) && (
                <a href={c.careersUrl} target="_blank" rel="noopener noreferrer">
                  Careers<span className="visually-hidden"> page for {c.name}</span>
                </a>
              )}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
