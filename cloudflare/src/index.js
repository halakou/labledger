const SITE = "https://labledgerdesk.pages.dev";
const CHANNEL = "https://t.me/labledgerdesk";
const GH_HEADERS = {
  accept: "application/vnd.github+json",
  "user-agent": "labledger-desk/1.0 (+https://labledgerdesk.pages.dev)",
  "x-github-api-version": "2022-11-28",
};
const GH_RUNS = [
  "https://api.github.com/repos/halakou/labledger/actions/workflows/pages.yml/runs?per_page=1",
  "https://api.github.com/repos/halakou/labledger/actions/runs?per_page=1",
];
const GH_DISPATCH = "https://api.github.com/repos/halakou/labledger/actions/workflows/pages.yml/dispatches";
const STALE_MS = 8 * 60 * 1000;

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

async function latestRun() {
  let githubHttp = null;
  for (const url of GH_RUNS) {
    try {
      const res = await fetch(url, {
        headers: GH_HEADERS,
        signal: AbortSignal.timeout(8000),
      });
      githubHttp = res.status;
      if (!res.ok) continue;
      const data = await res.json();
      const run = data.workflow_runs?.[0] || null;
      if (run) return { run, githubHttp };
    } catch {
      githubHttp = githubHttp || "err";
    }
  }
  return { run: null, githubHttp };
}

async function dispatchPages(env) {
  const token = String(env.GITHUB_DISPATCH_TOKEN || "").trim();
  if (!token) return "no-token";
  const res = await fetch(GH_DISPATCH, {
    method: "POST",
    headers: {
      ...GH_HEADERS,
      authorization: "Bearer " + token,
    },
    body: JSON.stringify({ ref: "main" }),
    signal: AbortSignal.timeout(8000),
  });
  if (res.status === 204) return "dispatched";
  return "dispatch-" + res.status;
}

async function tick(env) {
  const heartbeat = new Date().toISOString();
  let found = { run: null, githubHttp: null };
  let dispatch = "skip";
  try {
    found = await latestRun();
  } catch {
    found = { run: null, githubHttp: "err" };
  }
  const run = found.run;
  const created = run?.created_at ? Date.parse(run.created_at) : 0;
  const age = created ? Date.now() - created : Number.POSITIVE_INFINITY;
  if (age > STALE_MS) {
    try {
      dispatch = await dispatchPages(env);
    } catch {
      dispatch = "dispatch-fail";
    }
  }
  const last = {
    heartbeat,
    githubAt: run?.created_at || null,
    githubEvent: run?.event || null,
    githubStatus: run?.status || null,
    githubHttp: found.githubHttp,
    dispatch,
  };
  if (env.DESK) await env.DESK.put("last", JSON.stringify(last));
  return last;
}

export default {
  async scheduled(_controller, env) {
    await tick(env);
  },
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/health") {
      const raw = env.DESK ? await env.DESK.get("last") : null;
      let last = raw;
      try {
        last = raw ? JSON.parse(raw) : null;
      } catch {
        last = raw;
      }
      return Response.json({ ok: true, last, service: "labledger-desk" });
    }
    if (url.pathname === "/telegram" && request.method === "POST") {
      return handleTelegram(request, env);
    }
    return new Response("Lab Ledger desk", { status: 200 });
  },
};
