import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

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
  const chat = (process.env.TELEGRAM_CHAT_ID || "").trim();
  const h = handleFrom(chat);
  if (h) return "@" + h;
  if (/^-?\d+$/.test(chat)) return chat;
  const fromUrl = handleFrom(process.env.TELEGRAM_CHANNEL_URL || "");
  if (fromUrl) return "@" + fromUrl;
  return "@labledgerdesk";
}

function channelUrl() {
  const explicit = handleFrom(process.env.TELEGRAM_CHANNEL_URL || "");
  if (explicit) return "https://t.me/" + explicit;
  const fromChat = handleFrom(process.env.TELEGRAM_CHAT_ID || "");
  if (fromChat) return "https://t.me/" + fromChat;
  return "https://t.me/labledgerdesk";
}

function redactChat(chat) {
  if (/^-?\d+$/.test(chat)) return "numeric-id";
  return chat;
}

function hookSecret(token) {
  return createHash("sha256")
    .update("labledger-desk:" + token)
    .digest("hex")
    .slice(0, 32);
}

function escHtml(s) {
  const amp = "\x26";
  return String(s)
    .replace(/&/g, amp + "amp;")
    .replace(/</g, amp + "lt;")
    .replace(/>/g, amp + "gt;")
    .replace(/"/g, amp + "quot;");
}

function formatDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.getUTCDate() + " " + MONTHS[d.getUTCMonth()] + " " + d.getUTCFullYear();
}

function clipDek(text, max) {
  const t = String(text || "").replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  const sp = cut.lastIndexOf(" ");
  return (sp > 40 ? cut.slice(0, sp) : cut).replace(/[,:;–-]+$/, "") + "…";
}

function messageIdFrom(url) {
  const m = String(url || "").match(/\/(\d+)\/?$/);
  return m ? Number(m[1]) : 0;
}

function composeMessage(post) {
  const url = SITE + post.path;
  const lab = escHtml(post.lab || "Desk");
  const date = formatDate(post.publishedAt);
  const headline = escHtml(post.headline || "");
  const dek = clipDek(post.dek || "", 220);
  const kind = post.kind ? "  ·  " + escHtml(post.kind) : "";
  const lines = ["<b>" + lab + "</b>" + kind + (date ? "  ·  " + date : ""), "", "<b>" + headline + "</b>"];
  if (dek) lines.push("", "<blockquote>" + escHtml(dek) + "</blockquote>");
  lines.push("", "<i>Filed from the official source. The brief stays on the page.</i>");
  return {
    text: lines.join("\n"),
    payload: {
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
      reply_markup: {
        inline_keyboard: [[{ text: "Read the brief", url }]],
      },
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

async function loadJson(path, fallback) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return fallback;
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

const token = (process.env.TELEGRAM_BOT_TOKEN || "").trim();
const chat = telegramChatId();
const channel = channelUrl();
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
const briefs = Array.isArray(queue.briefs) ? queue.briefs : [];
const postedCount = Object.keys(posted).length;
const unposted = briefs.filter((b) => b.guid && b.headline && b.path && !posted[b.guid]);
const now = Date.now();
const fresh = unposted.filter((b) => {
  const t = Date.parse(b.publishedAt || "");
  return Number.isFinite(t) && now - t <= FRESH_MS;
});
const rest = unposted.filter((b) => !fresh.includes(b));
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
);

let sent = 0;
let failed = 0;
for (const post of toSend) {
  if (!post?.headline || !post?.path) continue;
  if (posted[post.guid]) continue;
  const msg = composeMessage(post);
  const data = await tg(token, "sendMessage", {
    chat_id: chat,
    text: msg.text,
    ...msg.payload,
  });
  const mid = data?.result?.message_id;
  if (data?.ok && mid) {
    posted[post.guid] = channel + "/" + mid;
    sent += 1;
    console.log("telegram sent", mid, post.path);
  } else {
    failed += 1;
    console.log("telegram send FAILED:", data.description || data.error_code || "unknown", post.path);
  }
  await sleep(350);
}

await writeFile(POSTED_FILE, JSON.stringify(posted));
console.log("telegram done sent", sent, "failed", failed, "cache", Object.keys(posted).length);
if (failed && !sent) process.exit(1);
