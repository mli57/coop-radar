export function About() {
  return (
    <main className="about">
      <h2>About</h2>
      <p>
        coop-radar lists Canadian intern and co-op postings from company career pages, and displays the newest first. Apply links go directly to the company's own posting.
      </p>
      <p>
        It checks each company about every 30 minutes and records when a posting first appears. 
        - "Already open when tracking began" means the posting was up before that company was checked, so its real post date is unknown.
      </p>
      <p>
        It's completely free to use, and does not require users to create accounts. 
        Additionally your last visit is only remembered in your own browser.
      </p>
      <p>
        <a href="https://github.com/mli57/coop-radar">Source code on GitHub</a>
      </p>
    </main>
  );
}
