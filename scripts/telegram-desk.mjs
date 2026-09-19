import { readFile, writeFile } from "node:fs/promises";

const SITE = (process.env.SITE_URL || "https://labledgerdesk.pages.dev").replace(/\/$/, "");
const POSTED_FILE = ".desk-posted.json";
const QUEUE_FILE = ".desk-queue.json";
const PHOTO = "assets/channel.jpg";
const TITLE = "Lab Ledger Desk";
const DESCRIPTION =
  "Official AI-lab briefs. One sourced page per move. The desk does not invent launches. labledgerdesk.pages.dev";

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
  if (currentTitle && currentTitle !== TITLE) {
    const res = await tg(token, "setChatTitle", { chat_id: chat, title: TITLE });
    console.log("telegram setChatTitle:", res.ok ? "ok" : res.description || res.error_code);
  } else if (!currentTitle) {
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

async function loadJson(path, fallback) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return fallback;
  }
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

const queue = await loadJson(QUEUE_FILE, { briefs: [] });
const posted = await loadJson(POSTED_FILE, {});
const briefs = Array.isArray(queue.briefs) ? queue.briefs : [];
const hourAgo = Date.now() - 70 * 60 * 1000;
const postedCount = Object.keys(posted).length;
let toSend = briefs.filter((b) => {
  const t = Date.parse(b.publishedAt || "");
  return Number.isFinite(t) && t >= hourAgo;
});
if (postedCount === 0) {
  toSend = briefs.slice(0, 6);
  console.log("telegram seed: cache empty, queueing", toSend.length, "newest briefs");
} else {
  console.log("telegram fresh window:", toSend.length, "posted cache:", postedCount);
}

let sent = 0;
let failed = 0;
for (const post of toSend) {
  if (!post?.headline || !post?.path) continue;
  if (posted[post.guid]) {
    console.log("telegram skip already posted:", post.path);
    continue;
  }
  const text = post.headline + "\n" + SITE + post.path;
  const data = await tg(token, "sendMessage", {
    chat_id: chat,
    text,
    disable_web_page_preview: false,
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
}

await writeFile(POSTED_FILE, JSON.stringify(posted));
console.log("telegram done sent", sent, "failed", failed, "cache", Object.keys(posted).length);
if (failed && !sent) process.exit(1);
