/**
 * location.ts: reads the free-text location each job board gives us.
 *
 * ", CA" can't be used to spot Canada: it means California in "San Francisco, CA"
 * and Canada in "Toronto, ON, CA". So this looks for Canadian place names instead.
 */

const CITIES: [string, RegExp][] = [
  ["Burnaby", /\bBurnaby\b/i],
  ["Calgary", /\bCalgary\b/i],
  ["Edmonton", /\bEdmonton\b/i],
  ["Guelph", /\bGuelph\b/i],
  ["Halifax", /\bHalifax\b/i],
  ["Kanata", /\bKanata\b/i],
  ["Kitchener", /\bKitchener\b/i],
  ["Longueuil", /\bLongueuil\b/i],
  ["Markham", /\bMarkham\b/i],
  ["Mississauga", /\bMississauga\b/i],
  ["Montreal", /\bMontr[eé]al\b/i],
  ["Oakville", /\bOakville\b/i],
  ["Ottawa", /\bOttawa\b/i],
  ["Quebec City", /\bQu[eé]bec City\b/i],
  ["Saskatoon", /\bSaskatoon\b/i],
  ["Toronto", /\bToronto\b/i],
  ["Vancouver", /\bVancouver\b(?!,\s*WA\b)/i],
  ["Vaughan", /\bVaughan\b/i],
  ["Waterloo", /\bWaterloo\b(?!,\s*IA\b)/i],
  ["Winnipeg", /\bWinnipeg\b/i],
];

// "Ontario, CA" is the California city. Canadian ones name a city first, like "Markham, Ontario, CA".
const REGION_NAME = /\b(Canada|Ontario(?!,\s*CA\b)|Qu[eé]bec|British Columbia|Alberta|Manitoba|Saskatchewan|Nova Scotia|Newfoundland|Prince Edward Island)\b/i;
// Left out because they're also country codes: SK (Slovakia), NL (Netherlands), PE (Peru).
const PROVINCE_CODE = /,\s*(ON|QC|BC|AB|MB|NS|NB)\b/;

// Also used by the Workday scraper to pick a board's Canadian office filters.
export function isCanadian(location: string): boolean {
  return REGION_NAME.test(location) || PROVINCE_CODE.test(location) || CITIES.some(([, city]) => city.test(location));
}

// "Remote" with no country named. "Remote, US" fails this because "US" is left over.
function isRemoteAnywhere(part: string): boolean {
  return /remote/i.test(part) && part.replace(/remote|global|worldwide|anywhere|[^a-z]/gi, "") === "";
}

// Postings with no location stay visible, as R4 asks.
export function showsInCanadaView(location: string | undefined): boolean {
  if (!location) return true;
  return isCanadian(location) || location.split(/[;•|]/).some(isRemoteAnywhere);
}

// The choices this posting matches in the location filter.
export function placesOf(location: string | undefined): string[] {
  if (!location) return [];
  const places = CITIES.filter(([, city]) => city.test(location)).map(([name]) => name);
  return /remote/i.test(location) ? ["Remote", ...places] : places;
}
