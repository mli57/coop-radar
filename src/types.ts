export interface Posting {
  company: string;
  title: string;
  url: string;
  location?: string;
}

// ATS recipes hit the board's public JSON API (fast, stable, no browser).
// css recipes drive Playwright against the rendered page — fallback only.
export type Recipe =
  | { type: "ashby" | "greenhouse" | "lever"; token: string }
  | { type: "css"; url: string; selector: string };
