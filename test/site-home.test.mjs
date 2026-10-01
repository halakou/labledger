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
