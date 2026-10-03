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

// C6: resolve chat from TELEGRAM_CHAT_ID only (handle or numeric), then
// the public fallback. TELEGRAM_CHANNEL_URL is unused (optional channel
// arg remains for unit tests of handle parsing).
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
  return chatIdOf({ chat: env.TELEGRAM_CHAT_ID });
}

export function channelUrlOf({ chat = "", channel = "" } = {}) {
  const explicit = handleFrom(channel);
  if (explicit) return "https://t.me/" + explicit;
  const fromChat = handleFrom(chat);
  if (fromChat) return "https://t.me/" + fromChat;
  return "https://t.me/" + FALLBACK_CHANNEL;
}

export function channelUrlFromEnv(env) {
  return channelUrlOf({ chat: env.TELEGRAM_CHAT_ID });
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

// Worker GET /posted returns { ok: true, posted: map }. A lost Actions cache
// must recover that map, not the wrapper keys "ok" and "posted". One extra
// unwrap covers a mirror that stored the wrapper itself. Values that are not
// message URLs are dropped so a bad payload cannot poison the ledger.
export function postedLedgerFromResponse(kv) {
  if (!kv || typeof kv !== "object" || Array.isArray(kv)) return {};
  let src = kv;
  if (isWrapper(src)) src = src.posted;
  if (isWrapper(src)) src = src.posted;
  if (!src || typeof src !== "object" || Array.isArray(src)) return {};
  const out = {};
  for (const [k, v] of Object.entries(src)) {
    if (!k || k === "ok" || k === "posted") continue;
    if (typeof v !== "string" || !v.startsWith("https://")) continue;
    out[k] = v;
  }
  return out;
}

function isWrapper(obj) {
  return Boolean(
    obj &&
      typeof obj === "object" &&
      !Array.isArray(obj) &&
      obj.ok === true &&
      obj.posted &&
      typeof obj.posted === "object" &&
      !Array.isArray(obj.posted),
  );
}


const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const KIND = {
  launch: { label: "Launch", mark: "▸" },
  research: { label: "Research", mark: "◆" },
  note: { label: "Note", mark: "·" },
};

function formatDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.getUTCDate() + " " + MONTHS[d.getUTCMonth()] + " " + d.getUTCFullYear();
}

function kindOf(post) {
  const raw = String(post.kind || post.kindLabel || "").toLowerCase();
  if (raw.startsWith("launch")) return KIND.launch;
  if (raw.startsWith("research")) return KIND.research;
  return KIND.note;
}

function sourceUrl(post) {
  const src = String(post.source || "").trim();
  if (!src.startsWith("https://")) return "";
  try {
    const u = new URL(src);
    if (u.protocol !== "https:") return "";
    return u.toString();
  } catch {
    return "";
  }
}

// The short channel post. telegram-desk keeps using this when AI is off,
// incomplete, or rejected. Do not add facts here.
export function composeChannelPost(post, site = "https://labledgerdesk.pages.dev") {
  const base = String(site || "https://labledgerdesk.pages.dev").replace(/\/$/, "");
  const url = base + post.path;
  const lab = escHtml(post.lab || "Desk");
  const date = formatDate(post.publishedAt);
  const headline = escHtml(post.headline || "");
  const dek = clipDek(post.dek || "", 220);
  const k = kindOf(post);
  const kicker =
    escHtml(k.mark + " " + k.label) +
    "  ·  <b>" +
    lab +
    "</b>" +
    (date ? "  ·  " + escHtml(date) : "");
  const lines = [kicker, "", "<b>" + headline + "</b>"];
  if (dek) lines.push("", "<blockquote>" + escHtml(dek) + "</blockquote>");
  lines.push("", "<i>Filed from the official source. The brief stays on the page.</i>");
  const buttons = [[{ text: "Read the brief", url }]];
  const src = sourceUrl(post);
  if (src) buttons[0].push({ text: "Official source", url: src });
  return {
    text: lines.join("\n"),
    url,
    payload: {
      parse_mode: "HTML",
      link_preview_options: {
        url,
        prefer_large_media: true,
        show_above_text: true,
      },
      reply_markup: { inline_keyboard: buttons },
    },
  };
}
