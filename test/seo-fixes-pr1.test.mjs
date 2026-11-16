import test from "node:test";
// Stream B PR1 — SEO fixes (metadata + copy). Tests build into a throwaway
// OUT, the same way site-home.test.mjs and archives.test.mjs do.
import { setOutForTests } from "../scripts/desk/config.mjs";
import { join } from "node:path";
import { tmpdir } from "node:os";
setOutForTests(join(tmpdir(), "desk-test-out-" + Buffer.from("seo-fixes-pr1-" + process.pid).toString("hex")));
import assert from "node:assert/strict";
import { SITE } from "../scripts/desk/core.mjs";
import { METHOD_SECTIONS } from "../scripts/desk/site-digest.mjs";

async function freshOut() {
  const { getOut } = await import("../scripts/desk/config.mjs");
  const out = getOut();
  const fs = await import("node:fs/promises");
  await fs.rm(out, { recursive: true, force: true });
  await fs.mkdir(out + "/fonts", { recursive: true });
  return { OUT: out, fs };
}

function brief(over) {
  return {
    guid: "g-1",
    lab: "OpenAI",
    labId: "openai",
    headline: "Introducing ChatGPT Wallet",
    dek: "A wallet for agents.",
    what: "OpenAI launched ChatGPT Wallet.",
    why: "Filed as a launch filing from OpenAI, 2026-11-13.",
    source: "https://openai.com/index/chatgpt-wallet/",
    path: "/b/2026/11/13/chatgpt-wallet/",
    slug: "chatgpt-wallet",
    year: "2026",
    month: "11",
    day: "13",
    dateLabel: "2026-11-13",
    publishedAt: "2026-11-13T08:00:00Z",
    kind: "launch",
    topics: [],
    briefNo: "001",
    mark: "O",
    color: "#fff",
    markFile: null,
    ...over,
  };
}

// The home board shows 20 lab rows plus the 8-row open rail — 28 rows.
// Feed.json already carried 28; the ItemList and llms.txt listed only 20.
function boardFixtures() {
  const lab = Array.from({ length: 20 }, (_, i) =>
    brief({ guid: "lab-" + i, headline: "Lab brief " + (i + 1), path: "/b/2026/11/15/lab-brief-" + (i + 1) + "/", slug: "lab-brief-" + (i + 1), briefNo: String(i + 1).padStart(3, "0") }),
  );
  const open = Array.from({ length: 8 }, (_, i) =>
    brief({
      guid: "open-" + i,
      lab: "vLLM",
      labId: "vllm",
      headline: "vLLM release " + (i + 1),
      path: "/b/2026/11/15/vllm-release-" + (i + 1) + "/",
      slug: "vllm-release-" + (i + 1),
      briefNo: "9" + String(i + 1).padStart(2, "0"),
    }),
  );
  return { lab, open };
}

test("F1: the home page head carries the Google site-verification meta tag", async () => {
  // The HTML-file route is broken on Cloudflare Pages (it strips ".html"
  // for root files), so verification goes through the meta tag. The file
  // itself stays as a fallback — this test pins the tag, not the file.
  const { writeHome } = await import("../scripts/desk/site-home.mjs");
  const { OUT, fs } = await freshOut();
  await writeHome({ allBriefs: [], briefs: [], boardPool: [], openBriefs: [], today: "2026-11-15" });
  const html = await fs.readFile(join(OUT, "index.html"), "utf8");
  assert.ok(
    html.includes('<meta name="google-site-verification" content="googlece6d31c0feb18c8c">'),
    "home head must carry the google-site-verification meta tag",
  );
});

test("F4: the home SearchAction target is the real search page", async () => {
  // The home search form submits to /search/; the old target /?q= performed
  // no search anywhere.
  const { writeHome } = await import("../scripts/desk/site-home.mjs");
  const { OUT, fs } = await freshOut();
  await writeHome({ allBriefs: [], briefs: [], boardPool: [], openBriefs: [], today: "2026-11-15" });
  const html = await fs.readFile(join(OUT, "index.html"), "utf8");
  const m = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  assert.ok(m, "home must carry JSON-LD");
  const graph = JSON.parse(m[1])["@graph"];
  const site = graph.find((g) => g["@type"] === "WebSite");
  assert.equal(site.potentialAction.target, SITE + "/search/?q={search_term_string}", "SearchAction must point at /search/");
});

test("F8: the home ItemList lists the whole board — lab rows plus open rail", async () => {
  const { writeHome } = await import("../scripts/desk/site-home.mjs");
  const { OUT, fs } = await freshOut();
  const { lab, open } = boardFixtures();
  await writeHome({ allBriefs: [...lab, ...open], briefs: lab, boardPool: lab, openBriefs: open, today: "2026-11-15" });
  const html = await fs.readFile(join(OUT, "index.html"), "utf8");
  const m = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  const graph = JSON.parse(m[1])["@graph"];
  const list = graph.find((g) => g["@type"] === "ItemList");
  assert.equal(list.numberOfItems, 28, "ItemList must count all 28 board rows");
  assert.equal(list.itemListElement.length, 28, "ItemList must carry 28 elements");
  assert.equal(list.itemListElement[0].url, SITE + lab[0].path, "first element is the first lab row");
  assert.equal(list.itemListElement[27].url, SITE + open[7].path, "last element is the last open row");
  assert.deepEqual(
    list.itemListElement.map((e, i) => e.position),
    Array.from({ length: 28 }, (_, i) => i + 1),
    "positions run 1..28 in page order",
  );
});

test("F8: llms.txt Latest briefs lists the whole board — lab rows plus open rail", async () => {
  const { writeLlms } = await import("../scripts/desk/site-home.mjs");
  const { OUT, fs } = await freshOut();
  const { lab, open } = boardFixtures();
  await writeLlms(lab, open);
  const txt = await fs.readFile(join(OUT, "llms.txt"), "utf8");
  const latest = txt.split("## Latest briefs\n")[1].trim().split("\n");
  assert.equal(latest.length, 28, "Latest briefs must list all 28 board rows");
  assert.ok(latest[0].includes(lab[0].path), "first line is the first lab row");
  assert.ok(latest[27].includes(open[7].path), "last line is the last open row");
});

test("F5: /method/ states the 12-word thin rule and the also-filed exception", () => {
  const section = METHOD_SECTIONS.find((s) => s.h === "How a brief is made");
  assert.ok(section, "the method page must have a How a brief is made section");
  // The P0-3 Editor's sentence, verbatim except "the feed" made precise:
  // thin briefs do not appear in the MAIN feed (the per-lab/per-topic/
  // per-kind feeds follow pages, not the board, so they do list thin rows).
  assert.ok(section.p.includes("under 12 words"), "the thin rule must state the 12-word threshold");
  assert.ok(section.p.includes("blog post by"), "the examples must include the most common thin shape");
  assert.ok(section.p.includes("does not appear in the main feed"), "the feed must be named as the main feed");
  assert.ok(section.p.includes("is not listed as an also-filed entry either"), "thin filings are never also-filed entries");
  assert.ok(
    section.p.includes("with the other filings linked from that row (a filing with almost no substance is never listed as an also-filed entry)"),
    "the clustering sentence must carry the thin exception",
  );
});

test("F7: the sitemap carries no lastmod for evergreen pages, honest dates for briefs and guides", async () => {
  const { writeArchives } = await import("../scripts/desk/archives.mjs");
  const { OUT, fs } = await freshOut();
  const primary = brief();
  await writeArchives({ allBriefs: [primary], briefs: [primary], openBriefs: [], allOpen: [], today: "2026-11-15" });
  const xml = await fs.readFile(join(OUT, "sitemap.xml"), "utf8");
  const entries = [...xml.matchAll(/<url><loc>([^<]+)<\/loc>(?:<lastmod>([^<]+)<\/lastmod>)?<\/url>/g)];
  assert.ok(entries.length > 100, "the sitemap must list the full site");
  for (const [, loc, lastmod] of entries) {
    const path = loc.replace(SITE, "");
    const isBrief = path.startsWith("/b/");
    const isGuide = path.startsWith("/learn/") && path !== "/learn/";
    if (!isBrief && !isGuide) {
      assert.equal(lastmod, undefined, "evergreen page " + path + " must carry no lastmod");
    }
  }
  const briefEntry = entries.find(([, loc]) => loc === SITE + primary.path);
  assert.ok(briefEntry, "the brief must be in the sitemap");
  assert.equal(briefEntry[2], "2026-11-13", "a brief keeps its honest per-brief date");
  const guideEntry = entries.find(([, loc]) => loc === SITE + "/learn/ai-agents-that-act/");
  assert.ok(guideEntry, "a guide must be in the sitemap");
  assert.equal(guideEntry[2], "2026-11-14", "a guide keeps its guide date");
});
