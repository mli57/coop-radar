/**
 * types.ts: the two shapes used across the project.
 *
 * Posting: one job, after scraping. This is what gets compared and alerted on.
 * Recipe: how to scrape one company. Stored in config/recipes.json.
 * 
 * Most companies they rent job boards from Ashby, Greenhouse, Workday and reskin them. 
 * Those have public JSON that can be queried for directly, which is fast and needs no browser. 
 * The css recipe is the fallback for the companies that build their own job boards.
 */

// Structure of one scraped job. Location is optional since not every job board provides this info.
export interface Posting {
  company: string;
  title: string;
  url: string;
  location?: string;
}

// Currently added 5 job boards picked by `type`. Each carries only the fields its board needs.
export type Recipe =
  // token is the company's ID in the board's URL: api.ashbyhq.com/posting-api/job-board/{token}
  | { type: "ashby" | "greenhouse" | "lever"; token: string }

  // url: page Playwright visits. selector: CSS selector matching one element per posting.
  | { type: "css"; url: string; selector: string }

  // tenant, wdInstance and each site come from the board URL: https://{tenant}.{wdInstance}.myworkdayjobs.com/en-US/{site}
  // sites is a list because some companies post student roles on a separate board (CIBC: "search" and "campus").
  | { type: "workday"; tenant: string; wdInstance: string; sites: string[] }

  // subdomain is the {subdomain} in https://{subdomain}.recruitee.com
  // cityFilter narrows to specific office cities when the board mixes regions
  | { type: "recruitee"; subdomain: string; cityFilter?: string[] };

// Only track intern/co-op roles for now, edit regex to change the scope later.
// (\b after "op" keeps "co-op"/"coop" from matching "cooperative".)
export const RELEVANT_TITLE = /\bintern(ship)?s?\b|\bco-?op\b|\bstudent\b/i;
