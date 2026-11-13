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
