// One-shot: post the donate announcement to the channel.
// Run manually with real secrets. Not part of the daily loop.
import { readFile, writeFile as writeRaw } from "node:fs/promises";
import { chatIdFromEnv } from "./desk/tg.mjs";

const token = process.env.TELEGRAM_BOT_TOKEN;
const url = (process.env.SITE_URL || "https://labledgerdesk.pages.dev").replace(/\/$/, "");
const postedFile = process.env.POSTED_FILE || ".desk-posted.json";
const chat = chatIdFromEnv(process.env);

if (!token) {
  console.error("TELEGRAM_BOT_TOKEN required");
  process.exit(1);
}

const text = [
  "\u{1F9AC} <b>The cost ledger is now public</b>",
  "",
  "We published what it actually costs to run this desk:",
  "",
  "\u2022 Servers we rent — <b>0</b>",
  "\u2022 Paywalls — <b>0</b>",
  "\u2022 Briefs logged so far — <b>64</b>",
  "\u2022 Review hours — the only line that is not free",
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
// NOTE: net.mjs write() targets OUT (dist-site) which is wiped every build —
// the ledger must live in the repo root to persist between runs.
await writeRaw(postedFile, JSON.stringify(posted, null, 2));
console.log("posted message", data.result?.message_id);
