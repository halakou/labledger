// One-shot cleanup: delete duplicate channel posts by id.
// Usage: DELETE_IDS=67,68,69 node scripts/cleanup-channel-posts.mjs
import { chatIdFromEnv, redactChat } from "./desk/tg.mjs";

const token = process.env.TELEGRAM_BOT_TOKEN;
const ids = (process.env.DELETE_IDS || "")
  .split(",")
  .map((s) => Number(s.trim()))
  .filter((n) => Number.isInteger(n));

if (!token) {
  console.error("TELEGRAM_BOT_TOKEN required");
  process.exit(1);
}
if (!ids.length) {
  console.error("DELETE_IDS required, e.g. 67,68,69");
  process.exit(1);
}
const target = chatIdFromEnv(process.env);
console.log("telegram chat:", redactChat(target));
for (const id of ids) {
  const res = await fetch("https://api.telegram.org/bot" + token + "/deleteMessage", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: target, message_id: id }),
  });
  const data = await res.json().catch(() => ({ ok: false }));
  console.log(id, data.ok ? "deleted" : "FAILED: " + (data.description || data.error_code || res.status));
}
