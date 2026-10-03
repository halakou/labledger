// Prints the current short channel post next to an AI rewrite.
// Never calls the Telegram Bot API. Live publishing stays behind DESK_AI_TELEGRAM.
import { readFile } from "node:fs/promises";
import { composeChannelPost, loadJson } from "./desk/tg.mjs";
import {
  aiEnabled,
  formatTelegramHtml,
  parseAiJson,
  rewriteBrief,
  selectProvider,
  validateGrounding,
} from "./desk/ai-telegram.mjs";

const SITE = (process.env.SITE_URL || "https://labledgerdesk.pages.dev").replace(/\/$/, "");

function arg(name) {
  const prefix = "--" + name + "=";
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : "";
}

function pool(file) {
  if (!file || typeof file !== "object") return [];
  const out = [];
  for (const key of ["briefs", "open", "items"]) {
    if (Array.isArray(file[key])) out.push(...file[key]);
  }
  return out;
}

function usable(post) {
  return Boolean(post && post.headline && (post.dek || post.what));
}

async function loadPost() {
  const fixturePath = arg("fixture");
  if (fixturePath) {
    const parsed = JSON.parse(await readFile(fixturePath, "utf8"));
    if (parsed.post) return { post: parsed.post, raw: parsed.raw || parsed.ai || parsed.mock || "" };
    return { post: parsed, raw: "" };
  }
  const guid = arg("guid");
  const queue = await loadJson(".desk-queue.json", { briefs: [] });
  const archive = await loadJson(".desk-archive.json", { briefs: [] });
  const posts = [...pool(queue), ...pool(archive)];
  const post = guid ? posts.find((item) => item && item.guid === guid) : posts.find(usable);
  if (!post) {
    console.log(guid ? "guid not found in .desk-queue.json or .desk-archive.json" : "no brief with headline and dek");
    process.exit(1);
  }
  return { post, raw: "" };
}

function printMessage(title, text) {
  console.log("\n=== " + title + " ===");
  console.log(text);
}

const { post, raw } = await loadPost();
const forceMock = process.argv.includes("--mock");
const provider = forceMock ? null : selectProvider(process.env);
console.log("ai-telegram dry-run");
console.log("live gate DESK_AI_TELEGRAM:", aiEnabled(process.env) ? "ON" : "off (default)");
console.log("provider:", provider ? provider.name + (provider.model ? " " + provider.model : "") : "none");
console.log("guid:", post.guid || "(none)");
console.log("headline:", post.headline);
console.log("this command never posts to Telegram");

const current = composeChannelPost(post, SITE);
printMessage("CURRENT SHORT composeMessage", current.text);

if (provider && !raw) {
  const result = await rewriteBrief(post, process.env, { site: SITE });
  console.log("\n=== AI REWRITE ===");
  console.log("status:", result.status);
  console.log("reason:", result.reason || "");
  console.log("provider:", result.provider || provider.name);
  if (result.ai) {
    console.log("ai.headline:", result.ai.headline);
    console.log("ai.tags:", (result.ai.tags || []).join(", "));
    console.log("ai.flags:", (result.ai.flags || []).join(" | "));
    console.log("ai.emoji:", result.ai.emoji || "(none)");
    console.log("ai.status:", result.ai.status);
  }
  if (result.status === "ok" && result.message) {
    console.log("preferText:", result.preferText);
    printMessage("AI TELEGRAM HTML", result.message.text);
  } else {
    console.log("fallback: live path would keep the short composeMessage above");
  }
} else {
  console.log("\n=== AI REWRITE ===");
  console.log("status: error");
  console.log("reason:", raw ? "fixture-raw" : "no-provider");
  console.log("fallback: live path would keep the short composeMessage above");
  const fixture = raw
    ? { post, model: raw }
    : JSON.parse(await readFile(new URL("./desk/ai-telegram-offline.json", import.meta.url), "utf8"));
  console.log("\n=== OFFLINE FIXTURE (not a live rewrite of the RSS item) ===");
  const ai = parseAiJson(fixture.model || fixture.raw || fixture.ai);
  const ground = validateGrounding(fixture.post, ai);
  console.log("fixture status:", ai.status);
  console.log("fixture headline:", ai.headline);
  console.log("fixture tags:", ai.tags.join(", "));
  console.log("fixture flags:", ai.flags.join(" | ") || "(none)");
  console.log("fixture emoji:", ai.emoji || "(none)");
  console.log("grounding:", ground.ok ? "ok" : ground.reason);
  if (ground.ok) {
    const msg = formatTelegramHtml(fixture.post, ai, { site: SITE });
    printMessage("OFFLINE FIXTURE HTML", msg.text);
  }
}
