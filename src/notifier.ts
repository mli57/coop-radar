/**
 * notifier.ts: sends the results of a scrape run to Discord.
 *
 * Two kinds of message go out:
 * 1. sendBrief: the regular summary of every new posting found this run.
 * 2. sendAlert: a single @here ping for one posting flagged as high priority.
 *
 * Both end up going through post(), which does the actual HTTP call to a
 * Discord webhook. Discord caps a single message at 2000 characters, so
 * sendBrief splits its list across multiple messages via postLines() rather
 * than sending one giant message that Discord would reject.
 *
 * Called by main.ts once a run's postings and priority companies are known.
 */

import type { Posting } from "./types.js";

// Discord's hard limit on a single message's length.
const DISCORD_MAX = 2000;

// Sends one message to Discord via its incoming webhook. webhookUrl picks which channel/bot posts it.
async function post(webhookUrl: string, content: string): Promise<void> {
  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });
  if (!res.ok) {
    throw new Error(`Discord webhook failed: ${res.status} ${await res.text()}`);
  }
}

// Formats one posting as a single Discord line: company: title, url, location.
function formatPosting(p: Posting): string {
  const loc = p.location ? ` (${p.location})` : "";
  return `• **${p.company}**: [${p.title}](<${p.url}>)${loc}`;
}

// Groups lines into as few messages as possible while staying under Discord's 2000-char limit.
async function postLines(webhookUrl: string, header: string, lines: string[]): Promise<void> {
  let chunk = header;
  for (const line of lines) {
    if (chunk.length + line.length + 1 > DISCORD_MAX) {
      await post(webhookUrl, chunk);
      chunk = line;
    } else {
      chunk += "\n" + line;
    }
  }
  await post(webhookUrl, chunk);
}

// Sends the regular per-run summary of every new posting found. Reads its webhook URL from BRIEF_WEBHOOK_URL.
export async function sendBrief(postings: Posting[]): Promise<void> {
  const url = process.env.BRIEF_WEBHOOK_URL;
  if (!url) throw new Error("BRIEF_WEBHOOK_URL is not set");
  if (postings.length === 0) {
    await post(url, "📡 coop-radar: no new postings this run.");
    return;
  }
  const header = `📡 **coop-radar** found ${postings.length} new posting(s):`;
  await postLines(url, header, postings.map(formatPosting));
}

// Sends a single @here ping for one priority posting. Reads its webhook URL from ALERT_WEBHOOK_URL.
export async function sendAlert(posting: Posting): Promise<void> {
  const url = process.env.ALERT_WEBHOOK_URL;
  if (!url) throw new Error("ALERT_WEBHOOK_URL is not set");
  const loc = posting.location ? `\n📍 ${posting.location}` : "";
  await post(
    url,
    `@here 🚨 **Priority posting at ${posting.company}**\n**${posting.title}**${loc}\n${posting.url}`
  );
}
