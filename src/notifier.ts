import type { Posting } from "./types.js";

const DISCORD_MAX = 2000;

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

function formatPosting(p: Posting): string {
  const loc = p.location ? ` — ${p.location}` : "";
  return `• **${p.company}**: [${p.title}](<${p.url}>)${loc}`;
}

// Splits lines into messages under Discord's 2000-char limit.
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

export async function sendBrief(postings: Posting[]): Promise<void> {
  const url = process.env.BRIEF_WEBHOOK_URL;
  if (!url) throw new Error("BRIEF_WEBHOOK_URL is not set");
  if (postings.length === 0) {
    await post(url, "📡 coop-radar: no new postings this run.");
    return;
  }
  const header = `📡 **coop-radar** — ${postings.length} new posting(s):`;
  await postLines(url, header, postings.map(formatPosting));
}

export async function sendAlert(posting: Posting): Promise<void> {
  const url = process.env.ALERT_WEBHOOK_URL;
  if (!url) throw new Error("ALERT_WEBHOOK_URL is not set");
  const loc = posting.location ? `\n📍 ${posting.location}` : "";
  await post(
    url,
    `@here 🚨 **Priority posting at ${posting.company}**\n**${posting.title}**${loc}\n${posting.url}`
  );
}
