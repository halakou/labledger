import test from "node:test";
import assert from "node:assert/strict";
import { composeChannelPost } from "../scripts/desk/tg.mjs";
import {
  ATRIA_MODEL,
  ATRIA_URL,
  aiEnabled,
  channelBodyFor,
  dryRunEnabled,
  emojiList,
  formatTelegramHtml,
  parseAiJson,
  rewriteBrief,
  selectProvider,
  validateGrounding,
  TEXT_OVER_PHOTO,
} from "../scripts/desk/ai-telegram.mjs";
import worker from "../cloudflare/src/index.js";

const post = {
  guid: "fixture:1",
  headline: "Example Lab ships Example Model",
  dek: "Example Lab said Example Model is available to waitlisted customers.",
  lab: "Example Lab",
  publishedAt: "2026-10-01T12:00:00.000Z",
  kind: "launch",
  topics: ["models"],
  source: "https://example.com/example-model",
  path: "/b/2026/10/01/example-model/",
};

function okRaw(extra = {}) {
  return JSON.stringify({
    status: "ok",
    headline: post.headline,
    tags: ["models"],
    emoji: "",
    flags: [],
    text: [
      "Example Lab said Example Model is available to waitlisted customers.",
      "",
      "- Example Lab named Example Model.",
      "- Example Model is available to waitlisted customers.",
      "",
      "Example Model is available to waitlisted customers.",
    ].join("\n"),
    ...extra,
  });
}

test("parseAiJson accepts fenced JSON and trims emoji to two", () => {
  const ai = parseAiJson("```json\n" + okRaw({ emoji: "🚀🔥✨" }) + "\n```");
  assert.equal(ai.status, "ok");
  assert.equal(ai.tags[0], "models");
  assert.equal(emojiList(ai.emoji).length, 2);
  assert.ok(ai.flags.includes("emoji-trimmed"));
});

test("parseAiJson rejects a bad status and a non-array tags field", () => {
  assert.throws(() => parseAiJson('{"status":"maybe","headline":"a","text":"b","tags":[],"flags":[],"emoji":""}'), /bad-status/);
  assert.throws(() => parseAiJson(okRaw({ tags: { name: "models" } })), /bad-tags/);
  const coerced = parseAiJson(okRaw({ tags: "models", flags: "thin-dek" }));
  assert.deepEqual(coerced.tags, ["models"]);
  assert.deepEqual(coerced.flags, ["thin-dek"]);
});

test("format stays inside two emoji and keeps the brief buttons", () => {
  const ai = parseAiJson(okRaw({ emoji: "🚀🔥" }));
  const msg = formatTelegramHtml(post, { ...ai, emoji: "🚀🔥✨" });
  assert.equal(emojiList(msg.text).length, 2);
  assert.equal(msg.payload.parse_mode, "HTML");
  assert.equal(msg.payload.reply_markup.inline_keyboard[0][0].text, "Read the brief");
  assert.equal(msg.payload.reply_markup.inline_keyboard[0][1].text, "Official source");
  assert.match(msg.text, /<b>.*Example Lab ships Example Model<\/b>/);
  assert.match(msg.text, /• Example Lab named Example Model\./);
  assert.equal(msg.text.includes("<script>"), false);
});

test("format escapes HTML from the model", () => {
  const ai = parseAiJson(okRaw({ headline: "A & B <C>" }));
  const msg = formatTelegramHtml(post, ai);
  assert.match(msg.text, /A &amp; B &lt;C&gt;/);
  assert.equal(msg.text.includes("<C>"), false);
});

test("incomplete rewrite falls back to the short post", () => {
  const ai = parseAiJson({
    status: "incomplete",
    headline: post.headline,
    tags: [],
    text: "",
    flags: ["source too thin for 300 words"],
    emoji: "",
  });
  const ground = validateGrounding(post, ai);
  assert.equal(ground.ok, false);
  assert.equal(ground.reason, "incomplete");
  const short = composeChannelPost(post);
  const picked = channelBodyFor({ status: "incomplete", reason: "incomplete", ai }, short.text);
  assert.equal(picked.via, "compose");
  assert.equal(picked.text, short.text);
  assert.match(short.text, /Filed from the official source/);
});

test("grounding rejects an invented number and an invented URL", () => {
  const numbered = parseAiJson(okRaw({
    text: post.dek + "\n\n- Example Lab reported a 99% score.\n\n" + post.dek,
  }));
  const numbers = validateGrounding(post, numbered);
  assert.equal(numbers.ok, false);
  assert.equal(numbers.reason, "invented-claim");

  const linked = parseAiJson(okRaw({
    text: post.dek + "\n\n- See https://evil.example/leak\n\n" + post.dek,
  }));
  const urls = validateGrounding(post, linked);
  assert.equal(urls.ok, false);
  assert.equal(urls.reason, "invented-url");
});

test("a grounded ok rewrite is eligible and long copy prefers text", () => {
  const ai = parseAiJson(okRaw());
  assert.equal(validateGrounding(post, ai).ok, true);
  const msg = formatTelegramHtml(post, ai);
  const picked = channelBodyFor({ status: "ok", message: { ...msg, text: "x".repeat(TEXT_OVER_PHOTO + 5) } }, "short");
  assert.equal(picked.via, "ai");
  assert.equal(picked.preferText, true);
});

test("provider chain prefers Atria Dawn, then the worker, then Groq, then Gemini", async () => {
  assert.equal(ATRIA_MODEL, "Atria-Dawn-Preview");
  assert.equal(selectProvider({}), null);
  assert.equal(selectProvider({ GROQ_API_KEY: "g", ATRIA_API_KEY: "a" }).name, "atria");
  assert.equal(selectProvider({ DESK_AI_WORKER_URL: "https://desk.example", DISPATCH_TOKEN: "t" }).name, "worker");
  assert.equal(selectProvider({ GROQ_API_KEY: "g" }).model, "llama-3.1-8b-instant");
  assert.equal(selectProvider({ GEMINI_API_KEY: "g" }).name, "gemini");

  const seen = [];
  const fetchImpl = async (url) => {
    seen.push(String(url));
    return {
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: okRaw() } }] }),
    };
  };
  const atria = await rewriteBrief(post, { ATRIA_API_KEY: "secret", GROQ_API_KEY: "other" }, { fetchImpl });
  assert.equal(atria.status, "ok");
  assert.equal(atria.provider, "atria");
  assert.equal(seen[0], ATRIA_URL);
  assert.equal(aiEnabled({}), false);
  assert.equal(aiEnabled({ DESK_AI_TELEGRAM: "1" }), true);
  assert.equal(aiEnabled({ DESK_AI_TELEGRAM: "true" }), true);
  assert.equal(aiEnabled({ DESK_AI_TELEGRAM: "yes" }), false);
  assert.equal(dryRunEnabled({ DESK_AI_DRY_RUN: "1" }), true);
  assert.equal(dryRunEnabled({}), false);
});

test("rewriteBrief reports no-provider and does not throw", async () => {
  const result = await rewriteBrief(post, {});
  assert.deepEqual({ status: result.status, reason: result.reason }, { status: "error", reason: "no-provider" });
  const picked = channelBodyFor(result, "SHORT");
  assert.equal(picked.via, "compose");
  assert.equal(picked.text, "SHORT");
});

test("worker /ai/rewrite stays behind DISPATCH_TOKEN and does not replace /health", async () => {
  const health = await worker.fetch(new Request("https://desk.example/health"), {});
  assert.equal(health.status, 200);
  const denied = await worker.fetch(new Request("https://desk.example/ai/rewrite", { method: "POST", body: "{}" }), {});
  assert.equal(denied.status, 503);
  const wrong = await worker.fetch(new Request("https://desk.example/ai/rewrite", {
    method: "POST",
    headers: { authorization: "Bearer no" },
    body: JSON.stringify({ post }),
  }), { DISPATCH_TOKEN: "yes" });
  assert.equal(wrong.status, 401);
  const get = await worker.fetch(new Request("https://desk.example/ai/rewrite"), { DISPATCH_TOKEN: "yes" });
  assert.equal(get.status, 405);
  const none = await worker.fetch(new Request("https://desk.example/ai/rewrite", {
    method: "POST",
    headers: { authorization: "Bearer yes", "content-type": "application/json" },
    body: JSON.stringify({ post, targetWords: 350 }),
  }), { DISPATCH_TOKEN: "yes" });
  assert.equal(none.status, 503);
  const body = await none.json();
  assert.equal(body.reason, "no-provider");

  const original = globalThis.fetch;
  globalThis.fetch = async (url) => {
    assert.equal(url, ATRIA_URL);
    return new Response(JSON.stringify({ choices: [{ message: { content: okRaw() } }] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  try {
    const ok = await worker.fetch(new Request("https://desk.example/ai/rewrite", {
      method: "POST",
      headers: { authorization: "Bearer yes", "content-type": "application/json" },
      body: JSON.stringify({ post, targetWords: 350 }),
    }), { DISPATCH_TOKEN: "yes", ATRIA_API_KEY: "secret" });
    assert.equal(ok.status, 200);
    const payload = await ok.json();
    assert.equal(payload.ok, true);
    assert.match(payload.raw, /Example Lab/);
  } finally {
    globalThis.fetch = original;
  }
});
