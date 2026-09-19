const SITE = "https://labledgerdesk.pages.dev";
const CHANNEL = "https://t.me/labledgerdesk";

function siteUrl(env) {
  const raw = String(env.SITE_URL || SITE).trim().replace(/\/$/, "");
  return raw.startsWith("https://") ? raw : SITE;
}

function channelUrl(env) {
  const raw = String(env.CHANNEL_URL || CHANNEL).trim().replace(/\/$/, "");
  return raw.startsWith("https://") ? raw : CHANNEL;
}

async function hookSecret(token) {
  const data = new TextEncoder().encode("labledger-desk:" + token);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
}

function textOf(msg) {
  return String(msg?.text || msg?.caption || "").trim();
}

function replyFor(text, env) {
  const site = siteUrl(env);
  const channel = channelUrl(env);
  const cmd = text.split(/\s+/)[0].split("@")[0].toLowerCase();
  if (cmd === "/start" || cmd === "/board") {
    return {
      text:
        "<b>Lab Ledger Desk</b>\n\nOfficial AI-lab briefs. Named sources only. One sourced page per move.\nThe desk does not invent launches and does not take tips here.",
      payload: {
        parse_mode: "HTML",
        link_preview_options: { is_disabled: true },
        reply_markup: {
          inline_keyboard: [
            [{ text: "Open the board", url: site + "/" }],
            [{ text: "Follow the channel", url: channel }],
          ],
        },
      },
    };
  }
  if (cmd === "/method") {
    return {
      text: "How the desk files: allow-listed official sources, a fixed brief, the primary source on the page.",
      payload: {
        reply_markup: { inline_keyboard: [[{ text: "Read the method", url: site + "/method/" }]] },
      },
    };
  }
  if (cmd === "/channel") {
    return {
      text: "The desk lives on the channel. Direct messages are not a news tip line.",
      payload: {
        reply_markup: { inline_keyboard: [[{ text: "Open the channel", url: channel }]] },
      },
    };
  }
  return {
    text: "The desk files official announcements on the board and the channel. Direct messages are not a tip line.",
    payload: {
      reply_markup: {
        inline_keyboard: [
          [{ text: "Open the board", url: site + "/" }],
          [{ text: "Follow the channel", url: channel }],
        ],
      },
    },
  };
}

async function handleTelegram(request, env) {
  const token = String(env.TELEGRAM_BOT_TOKEN || "").trim();
  if (!token) return new Response("no bot", { status: 503 });
  const expected = await hookSecret(token);
  const got = request.headers.get("x-telegram-bot-api-secret-token") || "";
  if (got !== expected) return new Response("denied", { status: 401 });
  const update = await request.json().catch(() => null);
  const msg = update?.message;
  if (!msg?.chat?.id) return new Response("ok");
  if (msg.chat.type !== "private") return new Response("ok");
  const reply = replyFor(textOf(msg), env);
  await fetch("https://api.telegram.org/bot" + token + "/sendMessage", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: msg.chat.id,
      text: reply.text,
      ...reply.payload,
    }),
  });
  return new Response("ok");
}

export default {
  async scheduled(_controller, env) {
    if (env.DESK) await env.DESK.put("last", "heartbeat " + new Date().toISOString());
  },
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/health") {
      const last = env.DESK ? await env.DESK.get("last") : null;
      return Response.json({ ok: true, last, service: "labledger-desk" });
    }
    if (url.pathname === "/telegram" && request.method === "POST") {
      return handleTelegram(request, env);
    }
    return new Response("Lab Ledger desk", { status: 200 });
  },
};
