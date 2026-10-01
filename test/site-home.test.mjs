import test from "node:test";
// Tests build into a throwaway OUT. The checkout's real dist-site holds long
// paths the Windows test runner cannot always delete, so it never touches it.
import { setOutForTests, getOut } from "../scripts/desk/config.mjs";
import { join } from "node:path";
import { tmpdir } from "node:os";
setOutForTests(join(tmpdir(), "desk-test-out-" + Buffer.from(import.meta.url).toString("hex").slice(0, 8)));
import assert from "node:assert/strict";
import { HOME_MAX, HOME_FAQ } from "../scripts/desk/site-home.mjs";

// writeHome copies font files into OUT/fonts, so a focused test has to clear
// OUT and recreate both the root and the fonts directory, exactly the way
// publishSite does.
async function freshOut() {
  const { OUT } = await import("../scripts/desk/core.mjs");
  const fs = await import("node:fs/promises");
  await fs.rm(OUT, { recursive: true, force: true });
  await fs.mkdir(OUT + "/fonts", { recursive: true });
  return { OUT, fs };
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
