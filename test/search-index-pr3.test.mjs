import test from "node:test";
// Stream B PR3 — search page weight. The /search/ page used to render every
// filed brief as HTML; now it ships today's board (28 rows) and the full
// ledger as search-index.json, fetched by the inline script on load. Tests
// build into a throwaway OUT, the same way site-home.test.mjs does.
import { setOutForTests } from "../scripts/desk/config.mjs";
import { join } from "node:path";
import { tmpdir } from "node:os";
setOutForTests(join(tmpdir(), "desk-test-out-" + Buffer.from("search-index-pr3-" + process.pid).toString("hex")));
import assert from "node:assert/strict";
import { clip, SITE } from "../scripts/desk/core.mjs";
import { HAS_VECTOR, SEARCH_SCRIPT, rowHtml, searchIndexRow, searchText } from "../scripts/desk/render.mjs";
import { writeSearch } from "../scripts/desk/site-home.mjs";
import { writeArchives } from "../scripts/desk/archives.mjs";

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

// 40 lab briefs behind a 20-row board, plus the 8-row open rail.
function fixtures() {
  const allLab = Array.from({ length: 40 }, (_, i) =>
    brief({
      guid: "lab-" + i,
      headline: "Lab brief " + (i + 1),
      path: "/b/2026/11/15/lab-brief-" + (i + 1) + "/",
      slug: "lab-brief-" + (i + 1),
      briefNo: String(i + 1).padStart(3, "0"),
    }),
  );
  const open = Array.from({ length: 8 }, (_, i) =>
    brief({
      guid: "open-" + i,
      lab: "vLLM",
      labId: "vllm",
      headline: "vLLM release " + (i + 1),
      path: "/b/2026/11/15/vllm-release-" + (i + 1) + "/",
      slug: "vllm-release-" + (i + 1),
      briefNo: "6" + String(i + 1).padStart(2, "0"),
      kind: "launch",
    }),
  );
  return { allLab, board: allLab.slice(0, 20), open };
}

function countRows(html) {
  return html.split('<article class="row ledger-row"').length - 1;
}

test("searchIndexRow carries every field the client renderer needs", () => {
  const b = brief({
    topics: ["agents"],
    alsoFiled: [{ lab: "TechCrunch", path: "/b/2026/11/13/chatgpt-wallet-tc/", headline: "ChatGPT Wallet is here and it is a very long headline that keeps going past eighty characters for the clipping check", dateLabel: "2026-11-13" }],
  });
  const row = searchIndexRow(b);
  assert.equal(row.lab, "OpenAI");
  assert.equal(row.labId, "openai");
  assert.equal(row.headline, "Introducing ChatGPT Wallet");
  assert.equal(row.dek, "A wallet for agents.");
  assert.equal(row.kind, "launch");
  assert.equal(row.kindLabel, "Launch");
  assert.deepEqual(row.topics, ["agents"]);
  assert.deepEqual(row.topicLabels, ["Agents"]);
  assert.equal(row.dateLabel, "2026-11-13");
  assert.equal(row.datetime, "2026-11-13");
  assert.equal(row.path, "/b/2026/11/13/chatgpt-wallet/");
  assert.equal(row.briefNo, "001");
  assert.equal(row.markFile, null);
  assert.equal(row.search, searchText(b));
  // The also-filed headline is clipped the same way rowHtml clips it.
  assert.equal(row.alsoFiled[0].headline, clip("ChatGPT Wallet is here and it is a very long headline that keeps going past eighty characters for the clipping check", 80));
  assert.equal(row.alsoFiled[0].lab, "TechCrunch");
});

test("the index search string is identical to rowHtml's data-search", () => {
  const b = brief({ topics: ["agents", "models"], alsoFiled: [{ lab: "The Verge", path: "/b/2026/11/13/x/", headline: "Verge filing", dateLabel: "2026-11-13" }] });
  const html = rowHtml(b);
  const m = html.match(/data-search="([^"]*)"/);
  assert.ok(m, "rowHtml writes a data-search attribute");
  assert.equal(searchIndexRow(b).search, m[1]);
});

test("writeSearch writes the full index and a 28-row page", async () => {
  const { OUT, fs } = await freshOut();
  const { allLab, board, open } = fixtures();
  await writeSearch({ allBriefs: allLab, briefs: board, openBriefs: open, today: "2026-11-15" });

  const payload = JSON.parse(await fs.readFile(join(OUT, "search-index.json"), "utf8"));
  assert.equal(payload.site, SITE);
  assert.equal(typeof payload.sprite, "string");
  assert.ok(payload.sprite.startsWith("/"), "payload carries the sprite path the client needs for fetched marks");
  assert.equal(payload.rows.length, 48, "index holds every filed brief: 40 lab + 8 open");
  assert.equal(payload.rows[0].path, allLab[0].path, "index keeps filing order");
  assert.equal(payload.rows[39].headline, "Lab brief 40");
  assert.equal(payload.rows[47].headline, "vLLM release 8");

  const html = await fs.readFile(join(OUT, "search", "index.html"), "utf8");
  assert.equal(countRows(html), 28, "page ships today's board only: 20 lab + 8 open");
  assert.ok(html.includes('id="search-feed"'), "feed carries the id the loader looks for");
  assert.ok(html.includes("48 LOGGED"), "badge still counts every filed brief");
  assert.ok(html.includes("Lab brief 1") && html.includes("Lab brief 20"), "board rows are on the page");
  assert.ok(!html.includes("Lab brief 21"), "briefs past the board are NOT in the page");
  assert.ok(html.includes("vLLM release 8"), "open rail rows are on the page");
  assert.ok(html.includes("The full ledger loads on this page when JavaScript runs"), "page says what loads on demand");
});

test("writeSearch with an empty ledger writes an empty index and page", async () => {
  const { OUT, fs } = await freshOut();
  await writeSearch({ allBriefs: [], briefs: [], openBriefs: [], today: "2026-11-15" });
  const payload = JSON.parse(await fs.readFile(join(OUT, "search-index.json"), "utf8"));
  assert.deepEqual(payload.rows, []);
  const html = await fs.readFile(join(OUT, "search", "index.html"), "utf8");
  assert.equal(countRows(html), 0);
  assert.ok(html.includes("Desk is waiting on the next official post."));
});

test("the inline script loads the index and renders with DOM APIs, never innerHTML", () => {
  assert.ok(SEARCH_SCRIPT.includes("fetch('/search-index.json')"), "script fetches the index");
  assert.ok(SEARCH_SCRIPT.includes("loadIndex();"), "script loads the index on the search page");
  assert.ok(SEARCH_SCRIPT.includes("feed.textContent=''"), "script clears the server rows before inserting the index");
  assert.ok(SEARCH_SCRIPT.includes("refreshRows();bindCites();apply();"), "script re-collects rows, re-binds cite buttons and re-applies the filter after load");
  assert.ok(!SEARCH_SCRIPT.includes("innerHTML"), "no innerHTML anywhere: the CSP's Trusted Types rule would refuse it");
  // ?q= is applied to the server rows first, then the index load re-applies
  // it to the full ledger — the load must come after the ?q= block.
  assert.ok(SEARCH_SCRIPT.indexOf("qp.get('q')") !== -1, "?q= handling still present");
  assert.ok(SEARCH_SCRIPT.indexOf("qp.get('q')") < SEARCH_SCRIPT.indexOf("loadIndex();"), "?q= applies before the index load, which re-applies it");
  // The loader only runs where the search page's feed exists.
  assert.ok(SEARCH_SCRIPT.includes("document.getElementById('search-feed')"), "loader is scoped to the search page");
});

test("the client's vector-mark list matches HAS_VECTOR exactly", () => {
  const m = SEARCH_SCRIPT.match(/var vec=\[([^\]]+)\]/);
  assert.ok(m, "script embeds the vector-mark list");
  const inScript = new Set(m[1].split(",").map((s) => s.replace(/^'|'$/g, "")));
  assert.equal(inScript.size, HAS_VECTOR.size, "same count as HAS_VECTOR");
  for (const id of HAS_VECTOR) assert.ok(inScript.has(id), "client list covers " + id);
});

test("sitemap lists search-index.json", async () => {
  const { OUT, fs } = await freshOut();
  const { allLab, board, open } = fixtures();
  await writeArchives({ allBriefs: allLab.slice(0, 2), briefs: board.slice(0, 2), openBriefs: open.slice(0, 1), allOpen: [], today: "2026-11-15" });
  const sitemap = await fs.readFile(join(OUT, "sitemap.xml"), "utf8");
  assert.ok(sitemap.includes("<loc>" + SITE + "/search-index.json</loc>"), "sitemap lists the index");
});
