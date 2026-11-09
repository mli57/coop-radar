// Imported from the scraper so a change to the file format breaks the site's build.
export type { TrackedPosting } from "../../src/postings.js";

export interface Company {
  name: string;
  careersUrl: string;
  status: "ok" | "broken" | "no-recipe";
  lastChecked: string;
  openCount: number;
}
