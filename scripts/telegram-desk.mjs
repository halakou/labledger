import { access, readFile, writeFile } from "node:fs/promises";
import {
  chatIdFromEnv,
  channelUrlFromEnv,
  clipDek,
  escHtml,
  hookSecret,
  loadJson,
  redactChat,
} from "./desk/tg.mjs";

const SITE = (process.env.SITE_URL || "https://labledgerdesk.pages.dev").replace(/\/$/, "");
const POSTED_FILE = ".desk-posted.json";
const QUEUE_FILE = ".desk-queue.json";
const PHOTO = "assets/channel.jpg";
const TITLE = "Lab Ledger Desk";
const DESCRIPTION =
  "Official AI-lab briefs. One sourced page per move. The desk does not invent launches. labledgerdesk.pages.dev";
const BOT_SHORT = "Official AI-lab briefs. Named sources only.";
const BOT_ABOUT =
  "Lab Ledger Desk files official announcements from named AI labs. One brief per move, about 100 words, with the primary source on the page. Follow the channel @labledgerdesk. Direct messages are not a news tip line.";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const FRESH_MS = 25 * 60 * 1000;
const COMMANDS = [
  { command: "start", description: "Open the board" },
  { command: "board", description: "The public ledger" },
  { command: "method", description: "How the desk files" },
  { command: "channel", description: "Follow the desk" },
];
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

function ogFile(post) {
  const p = String(post.path || "").replace(/\/$/, "");
  if (!p.startsWith("/b/")) return "";
  return "dist-site/og" + p + ".png";
}

async function fileExists(path) {
  if (!path) return false;
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function composeMessage(post) {
  const url = SITE + post.path;
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

async function tg(token, method, body) {
  const res = await fetch("https://api.telegram.org/bot" + token + "/" + method, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
  });
  return res.json().catch(() => ({ ok: false, description: "non-json " + res.status }));
}

async function tgPhoto(token, chat, filePath, msg) {
  const bytes = await readFile(filePath);
  const form = new FormData();
  form.set("chat_id", chat);
  form.set("photo", new Blob([bytes], { type: "image/png" }), "card.png");
  form.set("caption", msg.text);
  form.set("parse_mode", "HTML");
  form.set("reply_markup", JSON.stringify(msg.payload.reply_markup));
  const res = await fetch("https://api.telegram.org/bot" + token + "/sendPhoto", {
    method: "POST",
    body: form,
    signal: AbortSignal.timeout(30000),
  });
  return res.json().catch(() => ({ ok: false, description: "non-json " + res.status }));
}

async function sendPost(token, chat, post) {
  const msg = composeMessage(post);
  const photo = ogFile(post);
  if (await fileExists(photo)) {
    try {
      const data = await tgPhoto(token, chat, photo, msg);
      if (data?.ok && data.result?.message_id) return { data, how: "photo" };
      console.log("telegram photo FAILED, sending text:", data.description || data.error_code || "unknown");
    } catch (err) {
      console.log("telegram photo FAILED, sending text:", err?.message || err);
    }
  }
  const data = await tg(token, "sendMessage", {
    chat_id: chat,
    text: msg.text,
    ...msg.payload,
  });
  return { data, how: "text" };
}

async function diagnose(token, chat) {
  const me = await tg(token, "getMe", {});
  if (!me.ok) {
    console.log("telegram getMe FAILED:", me.description || me.error_code);
    return { ok: false, me: null, member: null };
  }
  console.log("telegram bot:", me.result.username ? "@" + me.result.username : me.result.id);
  const chatInfo = await tg(token, "getChat", { chat_id: chat });
  if (!chatInfo.ok) {
    console.log("telegram getChat FAILED:", chatInfo.description || chatInfo.error_code);
  } else {
    console.log(
      "telegram chat title:",
      chatInfo.result.title || "",
      "| username:",
      chatInfo.result.username ? "@" + chatInfo.result.username : "none",
      "| has photo:",
      Boolean(chatInfo.result.photo),
      "| description chars:",
      (chatInfo.result.description || "").length,
    );
  }
  const member = await tg(token, "getChatMember", { chat_id: chat, user_id: me.result.id });
  if (!member.ok) {
    console.log("telegram getChatMember FAILED:", member.description || member.error_code);
    return { ok: false, me: me.result, member: null, chat: chatInfo.ok ? chatInfo.result : null };
  }
  const m = member.result;
  console.log(
    "telegram bot status:",
    m.status,
    "| can_post:",
    m.can_post_messages,
    "| can_edit:",
    m.can_edit_messages,
    "| can_change_info:",
    m.can_change_info,
  );
  return { ok: true, me: me.result, member: m, chat: chatInfo.ok ? chatInfo.result : null };
}

async function setupChannel(token, chat, info) {
  const currentTitle = info?.chat?.title || "";
  if (currentTitle !== TITLE) {
    const res = await tg(token, "setChatTitle", { chat_id: chat, title: TITLE });
    console.log("telegram setChatTitle:", res.ok ? "ok" : res.description || res.error_code);
  } else {
    console.log("telegram setChatTitle: already set");
  }

  const currentDesc = info?.chat?.description || "";
  if (!currentDesc) {
    const res = await tg(token, "setChatDescription", { chat_id: chat, description: DESCRIPTION });
    console.log("telegram setChatDescription:", res.ok ? "ok" : res.description || res.error_code);
  } else {
    console.log("telegram setChatDescription: already set");
  }

  if (!info?.chat?.photo) {
    try {
      const bytes = await readFile(PHOTO);
      const form = new FormData();
      form.set("chat_id", chat);
      form.set("photo", new Blob([bytes], { type: "image/jpeg" }), "channel.jpg");
      const res = await fetch("https://api.telegram.org/bot" + token + "/setChatPhoto", {
        method: "POST",
        body: form,
        signal: AbortSignal.timeout(20000),
      });
      const data = await res.json().catch(() => ({}));
      console.log("telegram setChatPhoto:", data.ok ? "ok" : data.description || data.error_code || res.status);
    } catch (err) {
      console.log("telegram setChatPhoto FAILED:", err?.message || err);
    }
  } else {
    console.log("telegram setChatPhoto: already set");
  }
}

async function setupBot(token, info) {
  const name = info?.me?.first_name || "";
  if (name !== TITLE) {
    const res = await tg(token, "setMyName", { name: TITLE });
    console.log("telegram setMyName:", res.ok ? "ok" : res.description || res.error_code);
  } else {
    console.log("telegram setMyName: already set");
  }

  const short = await tg(token, "getMyShortDescription", {});
  if ((short.result?.short_description || "") !== BOT_SHORT) {
    const res = await tg(token, "setMyShortDescription", { short_description: BOT_SHORT });
    console.log("telegram setMyShortDescription:", res.ok ? "ok" : res.description || res.error_code);
  } else {
    console.log("telegram setMyShortDescription: already set");
  }

  const about = await tg(token, "getMyDescription", {});
  if ((about.result?.description || "") !== BOT_ABOUT) {
    const res = await tg(token, "setMyDescription", { description: BOT_ABOUT });
    console.log("telegram setMyDescription:", res.ok ? "ok" : res.description || res.error_code);
  } else {
    console.log("telegram setMyDescription: already set");
  }

  const cmds = await tg(token, "getMyCommands", {});
  const have = JSON.stringify((cmds.result || []).map((c) => c.command + ":" + c.description));
  const want = JSON.stringify(COMMANDS.map((c) => c.command + ":" + c.description));
  if (have !== want) {
    const res = await tg(token, "setMyCommands", { commands: COMMANDS, scope: { type: "all_private_chats" } });
    console.log("telegram setMyCommands:", res.ok ? "ok" : res.description || res.error_code);
  } else {
    console.log("telegram setMyCommands: already set");
  }

  const hook = String(process.env.TELEGRAM_WEBHOOK_URL || "").trim();
  if (hook.startsWith("https://")) {
    const res = await tg(token, "setWebhook", {
      url: hook,
      secret_token: hookSecret(token),
      allowed_updates: ["message"],
      drop_pending_updates: false,
    });
    console.log("telegram setWebhook:", res.ok ? "ok " + hook : res.description || res.error_code);
  } else {
    console.log("telegram setWebhook skipped");
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

const token = (process.env.TELEGRAM_BOT_TOKEN || "").trim();
const chat = chatIdFromEnv(process.env);
const channel = channelUrlFromEnv(process.env);
console.log("telegram token set:", Boolean(token));
console.log("telegram chat:", redactChat(chat));
console.log("telegram channel url:", channel);

if (!token) {
  console.log("telegram skipped: TELEGRAM_BOT_TOKEN missing");
  process.exit(0);
}

const info = await diagnose(token, chat);
await setupChannel(token, chat, info);
await setupBot(token, info);

const queue = await loadJson(QUEUE_FILE, { briefs: [] });
const posted = await loadJson(POSTED_FILE, {});

// If the GitHub Actions cache was evicted, the local posted ledger is empty.
// Recover it from the Worker's KV mirror before deciding what to send, so a
// cache miss cannot cause every brief ever filed to be re-posted.
if (!Object.keys(posted).length) {
  try {
    const wk = String(process.env.DESK_WORKER_URL || "").trim();
    const tok = String(process.env.DISPATCH_TOKEN || "").trim();
    if (wk.startsWith("https://") && tok) {
      const res = await fetch(wk.replace(/\/$/, "") + "/posted", {
        headers: { authorization: "Bearer " + tok },
        signal: AbortSignal.timeout(10000),
      });
      if (res.ok) {
        const kv = await res.json().catch(() => null);
        const n = kv && typeof kv === "object" ? Object.keys(kv).length : 0;
        if (n) {
          for (const k of Object.keys(kv)) posted[k] = kv[k];
          console.log("posted recovered from KV:", n);
        }
      }
    }
  } catch (err) {
    console.log("posted recover FAILED:", err?.message || err);
  }
}
const briefs = [...(Array.isArray(queue.briefs) ? queue.briefs : []), ...(Array.isArray(queue.open) ? queue.open : [])];
const postedCount = Object.keys(posted).length;
const unposted = briefs.filter((b) => b.guid && b.headline && b.path && !posted[b.guid]);
const now = Date.now();
const fresh = unposted.filter((b) => {
  const t = Date.parse(b.publishedAt || "");
  return Number.isFinite(t) && now - t <= FRESH_MS;
});
const rest = unposted.filter((b) => !fresh.includes(b));
// Quiet hours were removed: the desk's contract is that a brief reaches the
// channel at the same moment it reaches the site. Holding overnight releases
// "for the morning" only works if the audience is in one timezone — it is
// not, and it made the channel look stale next to the board.
const hourUTC = new Date().getUTCHours();
const quiet = false;
const cap = fresh.length ? 5 : rest.length ? (postedCount === 0 ? 6 : 3) : 2;
const toSend = fresh.length ? fresh.slice(0, 5) : rest.slice(0, postedCount === 0 ? 6 : 2);
console.log(
  "telegram sync unposted:",
  unposted.length,
  "fresh:",
  fresh.length,
  "queueing:",
  toSend.length,
  "posted cache:",
  postedCount,
  "hourUTC:",
  hourUTC,
  "quiet:",
  quiet,
  "cap:",
  cap,
);

let sent = 0;
let failed = 0;
for (const post of toSend) {
  if (!post?.headline || !post?.path) continue;
  if (posted[post.guid]) continue;
  const { data, how } = await sendPost(token, chat, post);
  const mid = data?.result?.message_id;
  if (data?.ok && mid) {
    posted[post.guid] = channel + "/" + mid;
    sent += 1;
    console.log("telegram sent", how, mid, post.path);
  } else {
    failed += 1;
    console.log("telegram send FAILED:", data.description || data.error_code || "unknown", post.path);
  }
  await sleep(350);
}

await writeFile(POSTED_FILE, JSON.stringify(posted));

// Mirror the posted ledger to the Worker's KV so a lost GitHub Actions cache
// cannot re-post every brief ever filed. Best effort: never fails the run.
try {
  const wk = String(process.env.DESK_WORKER_URL || "").trim();
  const tok = String(process.env.DISPATCH_TOKEN || "").trim();
  if (wk.startsWith("https://") && tok) {
    const res = await fetch(wk.replace(/\/$/, "") + "/posted", {
      method: "POST",
      headers: { "Content-Type": "application/json", authorization: "Bearer " + tok },
      body: JSON.stringify(posted),
      signal: AbortSignal.timeout(10000),
    });
    console.log("posted mirror:", res.ok ? "ok" : res.status);
  } else {
    console.log("posted mirror: skipped (no DESK_WORKER_URL)");
  }
} catch (err) {
  console.log("posted mirror FAILED:", err?.message || err);
}

console.log("telegram done sent", sent, "failed", failed, "cache", Object.keys(posted).length);
if (failed && !sent) process.exit(1);
