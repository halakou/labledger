// Shared Telegram helpers. Every script that talks to the bot API resolves
// the chat the same way and escapes the same way, so a change here fixes all
// of them instead of three copies drifting apart.
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

export const FALLBACK_CHANNEL = "labledgerdesk";

// A public channel handle, or "" if the value is not a usable handle. Accepts
// @handle, https://t.me/handle and https://telegram.me/handle/path forms.
// Numeric ids are refused here on purpose: they belong in TELEGRAM_CHAT_ID.
export function handleFrom(raw) {
  if (!raw) return "";
  let v = String(raw).trim();
  v = v.replace(/^https?:\/\/(www\.)?(t\.me|telegram\.me)\//i, "");
  v = v.replace(/^@/, "");
  v = v.split(/[/?#]/)[0];
  if (/^-?\d+$/.test(v)) return "";
  if (/^[A-Za-z][A-Za-z0-9_]{3,31}$/.test(v)) return v;
  return "";
}

// Resolve the chat id the bot posts to: an explicit handle wins, then an
// explicit numeric id, then the channel url, then the public fallback.
export function chatIdOf({ chat = "", channel = "" } = {}) {
  const c = String(chat || "").trim();
  const h = handleFrom(c);
  if (h) return "@" + h;
  if (/^-?\d+$/.test(c)) return c;
  const fromUrl = handleFrom(channel);
  if (fromUrl) return "@" + fromUrl;
  return "@" + FALLBACK_CHANNEL;
}

export function chatIdFromEnv(env) {
  return chatIdOf({ chat: env.TELEGRAM_CHAT_ID, channel: env.TELEGRAM_CHANNEL_URL });
}

export function channelUrlOf({ chat = "", channel = "" } = {}) {
  const explicit = handleFrom(channel);
  if (explicit) return "https://t.me/" + explicit;
  const fromChat = handleFrom(chat);
  if (fromChat) return "https://t.me/" + fromChat;
  return "https://t.me/" + FALLBACK_CHANNEL;
}

export function channelUrlFromEnv(env) {
  return channelUrlOf({ chat: env.TELEGRAM_CHAT_ID, channel: env.TELEGRAM_CHANNEL_URL });
}

// Never log a numeric chat id; it is a private identifier.
export function redactChat(chat) {
  if (/^-?\d+$/.test(String(chat))) return "numeric-id";
  return chat;
}

// The Telegram webhook secret is derived from the bot token so it rotates
// with the token and never has to be configured separately.
export function hookSecret(token) {
  return createHash("sha256")
    .update("labledger-desk:" + token)
    .digest("hex")
    .slice(0, 32);
}

export function escHtml(s) {
  const amp = "\x26";
  return String(s)
    .replace(/&/g, amp + "amp;")
    .replace(/</g, amp + "lt;")
    .replace(/>/g, amp + "gt;")
    .replace(/"/g, amp + "quot;");
}

// Trim a dek for a channel post on a word boundary, never mid-word.
export function clipDek(text, max) {
  const t = String(text || "").replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  const sp = cut.lastIndexOf(" ");
  return (sp > 40 ? cut.slice(0, sp) : cut).replace(/[,:;\u2013-]+$/, "") + "\u2026";
}

export async function loadJson(path, fallback) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return fallback;
  }
}
