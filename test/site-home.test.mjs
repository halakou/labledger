import test from "node:test";
// Tests build into a throwaway OUT. The checkout's real dist-site holds long
// paths the Windows test runner cannot always delete, so it never touches it.
import { setOutForTests, getOut } from "../scripts/desk/config.mjs";
import { join } from "node:path";
import { tmpdir } from "node:os";
setOutForTests(join(tmpdir(), "desk-test-out-" + Buffer.from(new URL(import.meta.url).pathname.split("/").pop() + "-" + process.pid).toString("hex")));
import assert from "node:assert/strict";
import { HOME_MAX, HOME_FAQ } from "../scripts/desk/site-home.mjs";

// writeHome copies font files into OUT/fonts, so a focused test has to clear
// OUT and recreate both the root and the fonts directory, exactly the way
// publishSite does.
async function freshOut() {
  // getOut(), not a destructured OUT: the dynamic import hands back the value
  // OUT held at first evaluation, which is dist-site if any earlier test in the
  // same process already imported core.mjs before setOutForTests ran.
  const { getOut } = await import("../scripts/desk/config.mjs");
  const out = getOut();
  const fs = await import("node:fs/promises");
  await fs.rm(out, { recursive: true, force: true });
  await fs.mkdir(out + "/fonts", { recursive: true });
  return { OUT: out, fs };
}

test("the homepage board is capped well below the full ledger", () => {
  // The homepage is a front page, not an archive. 28+ rows made it a
  // 19,000px page; the cap keeps it a front page and points the rest of the
  // ledger at /week/ and the lab archives.
  assert.ok(HOME_MAX <= 20, "HOME_MAX must stay at or under 20");
  assert.ok(HOME_MAX >= 12, "HOME_MAX must still show a real board");
});

test("the homepage FAQ has three complete entries", () => {
  assert.equal(HOME_FAQ.length, 3, "the homepage must have three FAQ entries");
  for (const item of HOME_FAQ) {
    assert.ok(typeof item.h === "string" && item.h.length > 0, "a FAQ heading is empty");
    assert.ok(typeof item.p === "string" && item.p.length > 0, "a FAQ body is empty");
  }
});

test("the homepage has exactly one visible h1 naming the board", async () => {
  // C1: the homepage had none of its own <h1>, only rail and board <h2>s, so
  // the page had no outline root for SEO or screen readers. The board header
  // now carries it.
  const { writeHome } = await import("../scripts/desk/site-home.mjs");
  const { OUT, fs } = await freshOut();
  const { join } = await import("node:path");
  await writeHome({ allBriefs: [], briefs: [], openBriefs: [], today: "2026-10-01" });
  const html = await fs.readFile(join(OUT, "index.html"), "utf8");
  const h1 = html.match(/<h1[^>]*>/g) || [];
  assert.equal(h1.length, 1, "the homepage must have exactly one <h1>");
  assert.ok(html.includes("<h1 class=\"board-h1\">Lab Ledger Desk</h1>"), "the h1 must name the board");
  assert.ok(html.includes("<h2 class=\"panel-title\">Trending frontiers</h2>"), "the frontier h2 stays a sibling");
});

test("the homepage search input carries a real accessible name", async () => {
  // C2: a placeholder is not a name. The input now has a label the assistive
  // tree can announce.
  const { writeHome } = await import("../scripts/desk/site-home.mjs");
  const { OUT, fs } = await freshOut();
  const { join } = await import("node:path");
  await writeHome({ allBriefs: [], briefs: [], openBriefs: [], today: "2026-10-01" });
  const built = await fs.readFile(join(OUT, "index.html"), "utf8");
  assert.ok(/<label for="q" class="sr-only">[^<]+<\/label>/.test(built), "the built page ships a label for #q");
  assert.ok(built.includes('aria-hidden="true">/'), "the visual kbd hint is hidden from the name");
});

test("the search page renders every brief the desk has filed", async () => {
  // C-item 3: the homepage board caps at 20 rows, so a reader could never
  // reach anything older by searching. /search/ renders the full ledger and
  // the script filters it down from ?q= on load.
  const { writeSearch } = await import("../scripts/desk/site-home.mjs");
  const { OUT, fs } = await freshOut();
  const { join } = await import("node:path");
  const briefs = [
    { headline: "GPT-5 ships a longer context window", labId: "openai", lab: "OpenAI", dateLabel: "01 Oct 2026", path: "/lab/openai/gpt-5-ships/", kind: "model", what: "A longer window.", topics: [] },
    { headline: "An old kernel patch from last year", labId: "linux", lab: "Linux", dateLabel: "10 Mar 2025", path: "/lab/linux/old-patch/", kind: "infra", what: "An old patch.", topics: [] },
  ];
  await writeSearch({ allBriefs: briefs, briefs, openBriefs: [], today: "2026-10-01" });
  const html = await fs.readFile(join(OUT, "search", "index.html"), "utf8");
  assert.ok(html.includes("Search the ledger"), "the page carries its own h1");
  assert.ok(html.includes("2 LOGGED"), "the count badge shows the full ledger, not the 20-row cap");
  assert.ok(html.includes('data-search="'), "each row carries a search index for the script to filter");
  assert.ok(html.includes("/lab/linux/old-patch/"), "a brief the homepage cannot show is reachable here");
  assert.ok(html.includes("URLSearchParams"), "the script actually reads the ?q= query string");
  assert.ok(html.includes('action="/search/"'), "the form submits back to the search page");
});

test("the frontier sidebar shows a lab's latest non-thin filing, never a thin one", async () => {
  // P0-3: the "Trending frontiers" sidebar used to read allBriefs, so a
  // thin filing that happened to be a lab's latest — DeepMind's
  // "Introducing Gemini 4 Hydrogen", whose what is only the
  // empty-summary fallback sentence — was featured on the home page with
  // no board slot. The sidebar now reads the filtered board pool: the
  // card shows the lab's latest substantive filing, and a lab whose
  // filings are all thin gets no card.
  const { writeHome } = await import("../scripts/desk/site-home.mjs");
  const { OUT, fs } = await freshOut();
  const { join } = await import("node:path");
  const thinDeepMind = {
    headline: "Introducing Gemini 4 Hydrogen",
    labId: "deepmind",
    lab: "DeepMind",
    dateLabel: "2026-11-12",
    path: "/b/2026/11/12/gemini-4-hydrogen/",
    what: "DeepMind published \u201cIntroducing Gemini 4 Hydrogen\u201d on 2026-11-12.",
  };
  const fullDeepMind = {
    headline: "Gemini 4 brings live reasoning to DeepMind research tools",
    labId: "deepmind",
    lab: "DeepMind",
    dateLabel: "2026-11-11",
    path: "/b/2026/11/11/gemini-4-research-tools/",
    what: "DeepMind Gemini 4 brings live reasoning and citations to its research tools, with a wider rollout planned for next month.",
  };
  const thinMistral = {
    headline: "Mistral releases a small model update",
    labId: "mistral",
    lab: "Mistral",
    dateLabel: "2026-11-12",
    path: "/b/2026/11/12/mistral-small-update/",
    what: "Mistral published \u201cMistral releases a small model update\u201d on 2026-11-12.",
  };
  const allBriefs = [thinDeepMind, thinMistral, fullDeepMind];
  const boardPool = [fullDeepMind];
  await writeHome({ allBriefs, briefs: [], boardPool, openBriefs: [], today: "2026-11-13" });
  const html = await fs.readFile(join(OUT, "index.html"), "utf8");
  assert.ok(html.includes("Gemini 4 brings live reasoning to DeepMind research tools"), "the DeepMind card shows the latest non-thin filing");
  assert.ok(!html.includes("Introducing Gemini 4 Hydrogen"), "the thin filing appears nowhere on the home page");
  assert.ok(!html.includes("Mistral releases a small model update"), "a thin-only lab's filing is not featured");
  assert.ok(!html.includes('frontier-name">Mistral'), "a lab whose filings are all thin gets no frontier card");
});

test("feed.json names a cluster's other filings in the item text", async () => {
  // The feed is built from the clustered board list, so a story takes one
  // feed slot — and that slot names the other filings, lab + headline +
  // date, instead of hiding them.
  const { writeLlms } = await import("../scripts/desk/site-home.mjs");
  const { OUT, fs } = await freshOut();
  const { join } = await import("node:path");
  const briefs = [
    {
      headline: "Introducing ChatGPT Wallet",
      path: "/b/2026/11/13/chatgpt-wallet/",
      lab: "OpenAI",
      source: "https://openai.com/index/chatgpt-wallet/",
      publishedAt: "2026-11-13T08:00:00Z",
      dateLabel: "2026-11-13",
      kind: "launch",
      topics: [],
      what: "OpenAI launched ChatGPT Wallet.",
      why: "Filed as a launch filing from OpenAI, 2026-11-13.",
      alsoFiled: [
        { lab: "TechCrunch", headline: "ChatGPT’s new Wallet lets AI agents shop", dateLabel: "2026-11-13" },
      ],
    },
  ];
  await writeLlms(briefs, []);
  const feed = JSON.parse(await fs.readFile(join(OUT, "feed.json"), "utf8"));
  assert.equal(feed.items.length, 1, "one story, one feed slot");
  assert.ok(feed.items[0].content_text.includes("Also filed by TechCrunch: ChatGPT’s new Wallet lets AI agents shop (2026-11-13)"));
});

test("feed.json content_text is the full what, not the why boilerplate", async () => {
  // P0-3: a feed item's text is the brief's own substance. The "why"
  // filing record ("Filed as a public note from …") used to sit in the
  // middle of it — and for a thin brief it was most of the item. The
  // source pointer is out too: external_url already carries the source.
  const { writeLlms } = await import("../scripts/desk/site-home.mjs");
  const { OUT, fs } = await freshOut();
  const { join } = await import("node:path");
  const briefs = [
    {
      headline: "Google Search gets a major upgrade with Gemini 4 Hydrogen",
      path: "/b/2026/11/12/google-search-gemini-4-hydrogen/",
      lab: "Google",
      source: "https://blog.google/products/search/gemini-4-hydrogen/",
      publishedAt: "2026-11-12T19:00:00Z",
      dateLabel: "2026-11-12",
      kind: "note",
      topics: [],
      what: "Google Search gets a major upgrade with Gemini 4 Hydrogen, bringing live reasoning and citations to results pages for everyone.",
      why: "Filed as a public note from Google, 2026-11-12.",
    },
    {
      headline: "Introducing ChatGPT Wallet",
      path: "/b/2026/11/13/chatgpt-wallet/",
      lab: "OpenAI",
      source: "https://openai.com/index/chatgpt-wallet/",
      publishedAt: "2026-11-13T08:00:00Z",
      dateLabel: "2026-11-13",
      kind: "launch",
      topics: [],
      what: "OpenAI launched ChatGPT Wallet.",
      why: "Filed as a launch filing from OpenAI, 2026-11-13.",
      alsoFiled: [
        { lab: "TechCrunch", headline: "ChatGPT’s new Wallet lets AI agents shop", dateLabel: "2026-11-13" },
      ],
    },
  ];
  await writeLlms(briefs, []);
  const feed = JSON.parse(await fs.readFile(join(OUT, "feed.json"), "utf8"));
  assert.equal(feed.items.length, 2, "two board briefs, two feed items");
  assert.equal(
    feed.items[0].content_text,
    "Google Search gets a major upgrade with Gemini 4 Hydrogen, bringing live reasoning and citations to results pages for everyone.",
    "a single filing's item text is exactly its what",
  );
  assert.ok(!feed.items[0].content_text.includes("Filed as a public note"), "no why boilerplate in the item text");
  assert.ok(!feed.items[0].content_text.includes("Primary source:"), "no redundant source pointer in the item text");
  assert.equal(feed.items[0].external_url, "https://blog.google/products/search/gemini-4-hydrogen/", "the source still travels as external_url");
  assert.equal(
    feed.items[1].content_text,
    "OpenAI launched ChatGPT Wallet. Also filed by TechCrunch: ChatGPT’s new Wallet lets AI agents shop (2026-11-13)",
    "a clustered story's item text is its what plus the alsoFiled line — and nothing else",
  );
  assert.ok(!feed.items[1].content_text.includes("Filed as a launch filing"), "no why boilerplate in a clustered item either");
});

test("the _headers CSP lets a same-origin form actually submit", async () => {
  // C-item 6: the CSP shipped form-action 'none', which blocked the search
  // form's GET before it reached the search page. The _headers file is written
  // alongside the feeds.
  const { writeLlms } = await import("../scripts/desk/site-home.mjs");
  const { OUT, fs } = await freshOut();
  const { join } = await import("node:path");
  await writeLlms([], []);
  const headers = await fs.readFile(join(OUT, "_headers"), "utf8");
  assert.ok(/form-action 'self'/.test(headers), "form-action allows the same origin");
  assert.ok(!/form-action 'none'/.test(headers), "the blocking 'none' directive is gone");
});

test("the homepage search form now points at the real search page", async () => {
  const { writeHome } = await import("../scripts/desk/site-home.mjs");
  const { OUT, fs } = await freshOut();
  const { join } = await import("node:path");
  await writeHome({ allBriefs: [], briefs: [], openBriefs: [], today: "2026-10-01" });
  const html = await fs.readFile(join(OUT, "index.html"), "utf8");
  assert.ok(html.includes('action="/search/"'), "the homepage form goes to /search/, not the homepage itself");
});

test("the page head links an apple-touch-icon so home-screen icons are not a thumbnail", async () => {
  // C-item 5: iOS Safari never falls back to the SVG favicon; without an
  // explicit apple-touch-icon the home-screen tile is a screenshot.
  const { writeHome } = await import("../scripts/desk/site-home.mjs");
  const { OUT, fs } = await freshOut();
  const { join } = await import("node:path");
  await writeHome({ allBriefs: [], briefs: [], openBriefs: [], today: "2026-10-01" });
  const html = await fs.readFile(join(OUT, "index.html"), "utf8");
  assert.ok(/<link rel="apple-touch-icon"[^>]*>/i.test(html), "the head declares an apple-touch-icon");
  assert.ok(/apple-touch-icon[^>]*icon-192\.png/.test(html), "it points at the square 192 PNG that ships with the build");
  assert.ok(/apple-touch-icon[^>]*icon-512\.png/.test(html), "the higher-resolution 512 is used when the device wants it");
});
