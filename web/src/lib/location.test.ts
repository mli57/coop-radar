import { describe, expect, it } from "vitest";
import { placesOf, showsInCanadaView } from "./location.js";

// Every location string in postings.json when this was written, sorted by hand.
const SHOWN = [
  "Canada",
  "Longueuil, Canada",
  "Montreal, Canada",
  "Remote (United States | Canada)",
  "Toronto",
  "Toronto, Canada",
  "Toronto, ON",
  "Toronto, ON, CA",
  "Waterloo / Ottawa / Ontario",
];

const HIDDEN = [
  " San Francisco, CA; Sunnyvale, CA",
  "Bellevue, WA; Menlo Park, CA; New York, NY",
  "Bengaluru",
  "Bucharest",
  "CH-Zurich-Observe",
  "Chicago, IL",
  "DE-Berlin-Trion Building",
  "Denver, CO",
  "Detroit, MI",
  "Dublin",
  "Dublin, IE",
  "Fins Only-DE-Munich-MSO",
  "GB-London",
  "Hybrid - New York, NY",
  "Hybrid - San Francisco",
  "Hybrid - San Francisco, CA",
  "Hybrid - Singapore",
  "London",
  "London, England",
  "Menlo Park, CA",
  "Menlo Park, CA; New York, NY",
  "Mexico City, Mexico",
  "New York, NY",
  "New York, NY; Pittsburgh, PA",
  "New York, NY; San Francisco, CA; Sunnyvale, CA; Los Angeles, CA; Seattle, WA",
  "New York, Seattle, South San Francisco HQ",
  "Oakland, CA",
  "PL-Warsaw-Lixa C",
  "Pittsburgh, PA",
  "Remote, US; San Francisco, CA, US; Seattle, WA, US; New York, NY, US",
  "San Francisco, CA",
  "San Francisco, CA • New York, NY",
  "San Francisco, CA, US; Palo Alto, CA, US; Seattle, WA, US; New York, NY, US",
  "San Francisco, CA, US; Remote, CA, US",
  "San Francisco, CA, US; Remote, US",
  "San Francisco, CA;  Sunnyvale, CA ; New York City, NY; Seattle, WA",
  "San Francisco, CA; New York, NY",
  "San Francisco, California, United States",
  "San Francisco, New York City, Seattle",
  "San Francisco, Seattle, New York City",
  "Seattle, San Francisco",
  "Seattle, WA",
  "Singapore",
  "Singapore City, Singapore - Singapore",
  "Sunnyvale, CA",
  "US-CA-Menlo Park",
  "Washington, DC",
  "Zurich, CH",
];

describe("showsInCanadaView", () => {
  it.each(SHOWN)("shows %s", (location) => expect(showsInCanadaView(location)).toBe(true));
  it.each(HIDDEN)("hides %s", (location) => expect(showsInCanadaView(location)).toBe(false));

  it("keeps postings with no location", () => {
    expect(showsInCanadaView(undefined)).toBe(true);
    expect(showsInCanadaView("")).toBe(true);
  });

  it.each(["Remote", "remote", "Remote - Global", "Hybrid; Remote", "London; Remote"])("shows %s", (location) => {
    expect(showsInCanadaView(location)).toBe(true);
  });

  it.each(["Remote, UK", "Remote - Germany", "Remote, US"])("hides %s", (location) => {
    expect(showsInCanadaView(location)).toBe(false);
  });

  it.each(["Amsterdam, NL", "Lima, PE", "Bratislava, SK", "Vancouver, WA", "Waterloo, IA", "Ontario, CA"])("hides %s", (location) => {
    expect(showsInCanadaView(location)).toBe(false);
  });

  it("still shows Markham, Ontario, CA", () => {
    expect(showsInCanadaView("Markham, Ontario, CA")).toBe(true);
  });

  it("recognises a Canadian province code without a known city", () => {
    expect(showsInCanadaView("Barrie, ON")).toBe(true);
    expect(showsInCanadaView("London, ON")).toBe(true);
  });
});

describe("placesOf", () => {
  it("finds every Canadian city named", () => {
    expect(placesOf("Waterloo / Ottawa / Ontario")).toEqual(["Ottawa", "Waterloo"]);
  });
  it("treats accented Montreal as the same city", () => {
    expect(placesOf("Montréal, QC")).toEqual(["Montreal"]);
  });
  it("lists Remote as a choice", () => {
    expect(placesOf("Remote (United States | Canada)")).toEqual(["Remote"]);
  });
  it("returns nothing when there is no location", () => {
    expect(placesOf(undefined)).toEqual([]);
  });
});
