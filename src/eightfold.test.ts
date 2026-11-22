import { afterEach, describe, expect, it, vi } from "vitest";
import { scrapeCompany } from "./scraper.js";

const recipe = { type: "eightfold", host: "careers.qualcomm.com", domain: "qualcomm.com" } as const;

const job = (id: number, name = `FY27 Intern - Role ${id} - Canada`, locations = ["Markham, Ontario, Canada"]) => ({
  id,
  name,
  locations,
  positionUrl: `/careers/job/${id}`,
});

// Answers each search with the jobs from `start` onward, 10 per page, out of `all`.
function board(all: ReturnType<typeof job>[], replies: (Response | null)[] = []) {
  const calls: string[] = [];
  vi.stubGlobal("fetch", async (url: string) => {
    calls.push(url);
    const scripted = replies.shift();
    if (scripted) return scripted;
    const start = Number(new URL(url).searchParams.get("start"));
    return Response.json({ data: { count: all.length, positions: all.slice(start, start + 10) } });
  });
  return calls;
}

// Runs a scrape while skipping the pauses between pages.
async function scrape() {
  vi.useFakeTimers();
  const result = scrapeCompany("Qualcomm Markham", recipe);
  await vi.runAllTimersAsync();
  return result;
}

describe("eightfold", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("asks only for Canadian jobs and reads every page until the end", async () => {
    const calls = board(Array.from({ length: 23 }, (_, i) => job(i)));
    const postings = await scrape();
    expect(postings).toHaveLength(23);
    expect(calls.map((u) => new URL(u).searchParams.get("start"))).toEqual(["0", "10", "20"]);
    const first = new URL(calls[0]!);
    expect(first.origin + first.pathname).toBe("https://careers.qualcomm.com/api/pcsx/search");
    expect(first.searchParams.get("domain")).toBe("qualcomm.com");
    expect(first.searchParams.get("location")).toBe("Canada");
  });

  it("stops after a full last page when the count says it's the end", async () => {
    const calls = board(Array.from({ length: 20 }, (_, i) => job(i)));
    expect(await scrape()).toHaveLength(20);
    expect(calls).toHaveLength(2);
  });

  it("keeps the clean title, the full job link and every location", async () => {
    board([job(446722198182, "  FY27 Intern - GPU Compiler - Canada (4 months) ", ["Markham, Ontario, Canada", "Toronto, Ontario, Canada"])]);
    expect(await scrape()).toEqual([
      {
        company: "Qualcomm Markham",
        title: "FY27 Intern - GPU Compiler - Canada (4 months)",
        url: "https://careers.qualcomm.com/careers/job/446722198182",
        location: "Markham, Ontario, Canada; Toronto, Ontario, Canada",
      },
    ]);
  });

  it("waits and retries once when the site says to slow down", async () => {
    const calls = board([job(1)], [new Response("Please try again later", { status: 429 })]);
    expect(await scrape()).toHaveLength(1);
    expect(calls).toHaveLength(2);
  });

  it("fails if the site is still limiting after the retry, so old data is kept", async () => {
    board([job(1)], [new Response("", { status: 429 }), new Response("", { status: 429 })]);
    vi.useFakeTimers();
    const result = scrapeCompany("Qualcomm Markham", recipe);
    const check = expect(result).rejects.toThrow("429");
    await vi.runAllTimersAsync();
    await check;
  });
});
