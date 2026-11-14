import test from "node:test";
// Tests build into a throwaway OUT, the same way archives.test.mjs does.
import { setOutForTests } from "../scripts/desk/config.mjs";
import { join } from "node:path";
import { tmpdir } from "node:os";
setOutForTests(join(tmpdir(), "desk-test-out-" + Buffer.from("ogcard-" + process.pid).toString("hex")));
import assert from "node:assert/strict";
import { isOgRecent, writeOgCards } from "../scripts/desk/ogcard.mjs";

test("isOgRecent keeps briefs filed within three weeks of the build date", () => {
  const today = "2026-11-14";
  assert.equal(isOgRecent({ publishedAt: "2026-11-13T08:00:00Z" }, today), true);
  // Exactly at the 21-day cutoff: still recent.
  assert.equal(isOgRecent({ publishedAt: "2026-10-24T00:00:00Z" }, today), true);
  // One second past the cutoff: not recent.
  assert.equal(isOgRecent({ publishedAt: "2026-10-23T23:59:59Z" }, today), false);
  assert.equal(isOgRecent({ publishedAt: "2026-10-02T08:00:00Z" }, today), false);
  // No parseable date: fail-open, keep the card.
  assert.equal(isOgRecent({}, today), true);
  assert.equal(isOgRecent({ publishedAt: "not-a-date" }, today), true);
  assert.equal(isOgRecent({ publishedAt: "2026-11-13T08:00:00Z" }, "not-a-date"), true);
});

function cardBrief(over) {
  return {
    guid: "g-card",
    lab: "OpenAI",
    labId: "openai",
    headline: "Card brief",
    dek: "",
    what: "",
    why: "",
    source: "https://openai.com/",
    path: "/b/2026/11/13/card-brief/",
    slug: "card-brief",
    year: "2026",
    month: "11",
    day: "13",
    dateLabel: "2026-11-13",
    publishedAt: "2026-11-13T08:00:00Z",
    kind: "launch",
    topics: [],
    briefNo: "001",
    mark: "O",
    color: "#10a37f",
    markFile: null,
    ...over,
  };
}

test("writeOgCards draws a card only for recent briefs and clears stale card paths", async () => {
  const { getOut } = await import("../scripts/desk/config.mjs");
  const fs = await import("node:fs/promises");
  const out = getOut();
  await fs.rm(out, { recursive: true, force: true });
  await fs.mkdir(out, { recursive: true });
  const recent = cardBrief({ guid: "g-recent" });
  const old = cardBrief({
    guid: "g-old",
    headline: "Old brief",
    path: "/b/2026/10/02/old-brief/",
    slug: "old-brief",
    publishedAt: "2026-10-02T08:00:00Z",
    // Stale path from when this brief was recent: the card no longer exists.
    ogImage: "/og/b/2026/10/02/old-brief.png",
  });
  const n = await writeOgCards([recent, old], "2026-11-14");
  assert.equal(n, 1, "one card drawn");
  assert.ok(recent.ogImage.startsWith("/og/b/2026/11/13/"), "recent brief gets a card path");
  assert.equal(old.ogImage, undefined, "old brief loses its stale card path so the page falls back to /og.jpg");
  const recentCard = await fs.readFile(join(out, "og/b/2026/11/13/card-brief.png"));
  assert.ok(recentCard.length > 0, "the recent card file exists");
  await assert.rejects(fs.readFile(join(out, "og/b/2026/10/02/old-brief.png")), "no card is drawn for the old brief");
});
