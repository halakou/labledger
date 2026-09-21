// One-shot cleanup: delete duplicate channel posts by id.
// Usage: DELETE_IDS=67,68,69 node scripts/cleanup-channel-posts.mjs
import { readFile } from "node:fs/promises";

const token = process.env.TELEGRAM_BOT_TOKEN;
const chat = process.env.TELEGRAM_CHAT_ID;
const url = process.env.TELEGRAM_CHANNEL_URL || "";
const ids = (process.env.DELETE_IDS || "")
  .split(",")
  .map((s) => Number(s.trim()))
  .filter((n) => Number.isInteger(n));

function handleFrom(raw) {
  if (!raw) return "";
  let v = String(raw).trim();
  v = v.replace(/^https?:\/\/(www\.)?(t\.me|telegram\.me)\//i, "");
  v = v.replace(/^@/, "");
  v = v.split(/[/?#]/)[0];
  if (/^-?\d+$/.test(v)) return "";
  if (/^[A-Za-z][A-Za-z0-9_]{3,31}$/.test(v)) return v;
  return "";
}
function telegramChatId() {
  const c = (chat || "").trim();
  const h = handleFrom(c);
  if (h) return "@" + h;
  if (/^-?\d+$/.test(c)) return c;
  const fromUrl = handleFrom(url);
  if (fromUrl) return "@" + fromUrl;
  return "@labledgerdesk";
}

if (!token) {
  console.error("TELEGRAM_BOT_TOKEN required");
  process.exit(1);
}
if (!ids.length) {
  console.error("DELETE_IDS required, e.g. 67,68,69");
  process.exit(1);
}
const target = telegramChatId();
for (const id of ids) {
  const res = await fetch("https://api.telegram.org/bot" + token + "/deleteMessage", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: target, message_id: id }),
  });
  const data = await res.json().catch(() => ({ ok: false }));
  console.log(id, data.ok ? "deleted" : "FAILED: " + (data.description || data.error_code || res.status));
}
