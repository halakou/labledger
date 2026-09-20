// One-shot: post the donate announcement to the channel.
// Run manually with real secrets. Not part of the daily loop.
import { readFile } from "node:fs/promises";

const token = process.env.TELEGRAM_BOT_TOKEN;
const chat = process.env.TELEGRAM_CHAT_ID;
const url = process.env.SITE_URL || "https://labledgerdesk.pages.dev";
const postedFile = process.env.POSTED_FILE || ".desk-posted.json";

if (!token || !chat) {
  console.error("TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID required");
  process.exit(1);
}

const text = [
  "🪶 <b>The cost ledger is now public</b>",
  "",
  "We published what it actually costs to run this desk:",
  "",
  "• Servers we rent — <b>0</b>",
  "• Paywalls — <b>0</b>",
  "• Briefs logged so far — <b>64</b>",
  "• Review hours — the only line that is not free",
  "",
  "If the desk has saved you an hour this month, the best way to say it",
  "costs nothing: send us a lab we missed, forward one dated brief to",
  "someone still reading AI news from screenshots, or star the pipeline.",
  "",
  "<i>Support what you can audit.</i>",
].join("\n");

// idempotency: key on the donate announcement guid
const guid = url + "/donate/#announce";
let posted = {};
try {
  posted = JSON.parse(await readFile(postedFile, "utf8"));
} catch {}
if (posted[guid]) {
  console.log("already announced, skipping");
  process.exit(0);
}

const res = await fetch("https://api.telegram.org/bot" + token + "/sendMessage", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    chat_id: chat,
    text,
    parse_mode: "HTML",
    link_preview_options: { url: url + "/donate/", prefer_large_media: true, show_above_text: false },
    reply_markup: {
      inline_keyboard: [[
        { text: "See the cost ledger", url: url + "/donate/" },
        { text: "How the desk works", url: url + "/method/" },
      ]],
    },
  }),
});
const data = await res.json().catch(() => ({ ok: false }));
if (!data.ok) {
  console.error("FAILED:", data.description || data.error_code || res.status);
  process.exit(1);
}
posted[guid] = new Date().toISOString();
const { write } = await import("./desk/net.mjs");
await write(postedFile, JSON.stringify(posted, null, 2));
console.log("posted message", data.result?.message_id);
