import test from "node:test";
// Tests build into a throwaway OUT, the same way site-home.test.mjs does.
import { setOutForTests } from "../scripts/desk/config.mjs";
import { join } from "node:path";
import { tmpdir } from "node:os";
setOutForTests(join(tmpdir(), "desk-test-out-" + Buffer.from("archives-" + process.pid).toString("hex")));
import assert from "node:assert/strict";
import { writeArchives } from "../scripts/desk/archives.mjs";

async function freshOut() {
  const { getOut } = await import("../scripts/desk/config.mjs");
  const out = getOut();
  const fs = await import("node:fs/promises");
  await fs.rm(out, { recursive: true, force: true });
  await fs.mkdir(out, { recursive: true });
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

test("rss names a cluster's other filings in the item description", async () => {
  const { OUT, fs } = await freshOut();
  const primary = brief({
    alsoFiled: [
      { lab: "TechCrunch", headline: "ChatGPT’s new Wallet lets AI agents shop", dateLabel: "2026-11-13", path: "/b/2026/11/13/chatgpt-wallet-tc/" },
    ],
  });
  await writeArchives({ allBriefs: [primary], briefs: [primary], openBriefs: [], allOpen: [], today: "2026-11-13" });
  const rss = await fs.readFile(join(OUT, "rss.xml"), "utf8");
  assert.ok(rss.includes("Also filed by TechCrunch: ChatGPT’s new Wallet lets AI agents shop (2026-11-13)"), "the other filing is named in RSS");
});

test("each /b/ page of a cluster names the other side of the story", async () => {
  const { OUT, fs } = await freshOut();
  const primary = brief();
  const duplicate = brief({
    guid: "g-2",
    lab: "TechCrunch",
    labId: "techcrunch",
    headline: "ChatGPT’s new Wallet lets AI agents shop and check out for you",
    path: "/b/2026/11/13/chatgpt-wallet-tc/",
    slug: "chatgpt-wallet-tc",
  });
  const clusterNotes = new Map([
    ["g-1", { alsoFiled: [{ lab: "TechCrunch", headline: duplicate.headline, dateLabel: "2026-11-13", path: duplicate.path }] }],
    ["g-2", { clusterPrimary: { lab: "OpenAI", headline: primary.headline, dateLabel: "2026-11-13", path: primary.path } }],
  ]);
  await writeArchives({ allBriefs: [primary, duplicate], briefs: [primary], openBriefs: [], allOpen: [], today: "2026-11-13", clusterNotes });
  const primaryPage = await fs.readFile(join(OUT, "b/2026/11/13/chatgpt-wallet/index.html"), "utf8");
  assert.ok(primaryPage.includes("Also filed"), "the primary page lists its other filings");
  assert.ok(primaryPage.includes('href="/b/2026/11/13/chatgpt-wallet-tc/"'), "the primary page links to the duplicate");
  assert.ok(primaryPage.includes("ChatGPT’s new Wallet lets AI agents shop and check out for you"), "the primary page names the duplicate's headline");
  const dupPage = await fs.readFile(join(OUT, "b/2026/11/13/chatgpt-wallet-tc/index.html"), "utf8");
  assert.ok(dupPage.includes("Same story"), "the duplicate page names the cluster");
  assert.ok(dupPage.includes('href="/b/2026/11/13/chatgpt-wallet/"'), "the duplicate page links back to the primary");
});

test("a /b/ page with no cluster note renders no cluster section", async () => {
  const { OUT, fs } = await freshOut();
  const single = brief();
  await writeArchives({ allBriefs: [single], briefs: [single], openBriefs: [], allOpen: [], today: "2026-11-13" });
  const page = await fs.readFile(join(OUT, "b/2026/11/13/chatgpt-wallet/index.html"), "utf8");
  assert.equal(page.includes("Also filed"), false);
  assert.equal(page.includes("Same story"), false);
});

test("every filed brief keeps its /b/ page and sitemap URL past the old 500 cap", async () => {
  // P0-2: the old cap sliced the archive to 500, so the next build dropped
  // the older briefs' /b/ pages (404) and their sitemap entries.
  const { OUT, fs } = await freshOut();
  const many = Array.from({ length: 600 }, (_, i) => brief({
    guid: "g-" + i,
    headline: "Brief number " + i,
    slug: "brief-number-" + i,
    path: "/b/2026/11/13/brief-number-" + i + "/",
    publishedAt: "2026-11-13T08:00:00Z",
  }));
  await writeArchives({ allBriefs: many, briefs: many.slice(0, 28), openBriefs: [], allOpen: [], today: "2026-11-13" });
  const pages = await fs.readdir(join(OUT, "b/2026/11/13"));
  assert.equal(pages.length, 600, "all 600 briefs get a /b/ page");
  const sitemap = await fs.readFile(join(OUT, "sitemap.xml"), "utf8");
  for (const b of many) assert.ok(sitemap.includes(b.path), "sitemap keeps " + b.path);
});

test("topic and kind pages show the latest 80 rows and keep the true total in JSON-LD", async () => {
  // P0-2: with the archive uncapped, the topic/kind lists would render
  // every matching row (multi-MB pages), so they cap at 80 like /lab/.
  const { OUT, fs } = await freshOut();
  const many = Array.from({ length: 100 }, (_, i) => brief({
    guid: "g-t-" + i,
    headline: "Topic brief " + i,
    slug: "topic-brief-" + i,
    path: "/b/2026/11/13/topic-brief-" + i + "/",
    topics: ["llm"],
    kind: "note",
  }));
  await writeArchives({ allBriefs: many, briefs: many.slice(0, 28), openBriefs: [], allOpen: [], today: "2026-11-13" });
  const topic = await fs.readFile(join(OUT, "topic/llm/index.html"), "utf8");
  assert.equal((topic.match(/class="row ledger-row"/g) || []).length, 80, "topic page renders the latest 80 rows");
  assert.ok(topic.includes('"numberOfItems":100'), "topic JSON-LD keeps the true total");
  assert.ok(topic.includes("The latest filed briefs tagged"), "topic dek no longer claims every brief is listed");
  const kind = await fs.readFile(join(OUT, "kind/note/index.html"), "utf8");
  assert.equal((kind.match(/class="row ledger-row"/g) || []).length, 80, "kind page renders the latest 80 rows");
  assert.ok(kind.includes('"numberOfItems":100'), "kind JSON-LD keeps the true total");
});
