/**
 * term.ts: reads the work term from a title, only when it's clear.
 * "Intern 2027" has no season and "Fall/Winter 2026" has two, so both stay blank.
 */

const SEASONS = ["Winter", "Spring", "Summer", "Fall"];

export function termOf(title: string): string | null {
  if (title.match(/\b(spring|summer|fall|autumn|winter)\b/gi)?.length !== 1) return null;
  const match = title.match(/\b(spring|summer|fall|autumn|winter)[\s,-]*(?:20|')(\d\d)\b/i);
  if (!match) return null;
  const season = match[1]!.toLowerCase() === "autumn" ? "Fall" : match[1]!;
  return `${season[0]!.toUpperCase()}${season.slice(1).toLowerCase()} 20${match[2]}`;
}

// Earliest term first: by year, then by the order terms happen in a year.
export function compareTerms(a: string, b: string): number {
  const [seasonA = "", yearA = ""] = a.split(" ");
  const [seasonB = "", yearB = ""] = b.split(" ");
  return yearA.localeCompare(yearB) || SEASONS.indexOf(seasonA) - SEASONS.indexOf(seasonB);
}
