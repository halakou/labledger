import test from "node:test";
// Tests build into a throwaway OUT, the same way site-home.test.mjs does.
import { setOutForTests } from "../scripts/desk/config.mjs";
import { join } from "node:path";
import { tmpdir } from "node:os";
setOutForTests(join(tmpdir(), "desk-test-out-" + Buffer.from(new URL(import.meta.url).pathname.split("/").pop() + "-" + process.pid).toString("hex")));
import assert from "node:assert/strict";
import { watchdogState, writeStatus } from "../scripts/desk/status.mjs";

async function freshOut() {
  const { getOut } = await import("../scripts/desk/config.mjs");
  const out = getOut();
  const fs = await import("node:fs/promises");
  await fs.rm(out, { recursive: true, force: true });
  await fs.mkdir(out + "/fonts", { recursive: true });
  return { OUT: out, fs };
}

const freshWatchdog = () => ({
  reachable: true,
  ok: true,
  heartbeat: "2026-11-14T13:00:58.020Z",
  builtAt: "2026-11-14T12:46:13.497Z",
  siteHttp: 200,
  ageMs: 60000,
  dispatch: "dispatched",
  staleAfterMs: 720000,
  fetchedAt: "2026-11-14T13:01:00.000Z",
});

test("the watchdog state is judged from the snapshot's own numbers", () => {
  // P1-4: one rule, in one place — the page and the tests can never
  // disagree about what "stale" means.
  assert.equal(watchdogState(freshWatchdog()), "OK", "a fresh heartbeat is OK");
  assert.equal(watchdogState({ ...freshWatchdog(), ageMs: 720001 }), "STALE", "older than the threshold is STALE");
  assert.equal(watchdogState({ ...freshWatchdog(), ageMs: 720000 }), "OK", "exactly at the threshold is still OK");
  assert.equal(watchdogState({ ...freshWatchdog(), siteHttp: 500 }), "DEGRADED", "a non-200 site check is DEGRADED");
  assert.equal(watchdogState({ reachable: false, fetchedAt: "2026-11-14T13:01:00.000Z" }), "UNKNOWN", "an unreachable watchdog is UNKNOWN");
  assert.equal(watchdogState(undefined), "UNKNOWN", "a missing snapshot is UNKNOWN too");
});

test("the status page shows the build time and the watchdog snapshot", async () => {
  // P1-4: the values on the page are the ones the build saw — the same
  // builtAt desk-status.json carries, and the watchdog numbers from the
  // build-time /health fetch, labelled with the snapshot time.
  const { OUT, fs } = await freshOut();
  const { join } = await import("node:path");
  await writeStatus({ builtAt: "2026-11-14T13:01:14.633Z", feeds: 18, boards: 9, watchdog: freshWatchdog(), today: "2026-11-14" });
  const html = await fs.readFile(join(OUT, "status/index.html"), "utf8");
  assert.ok(html.includes("2026-11-14T13:01:14.633Z"), "the build time is on the page");
  assert.ok(html.includes("/desk-status.json"), "and it points at the status document");
  assert.ok(html.includes("<b>18</b> official feeds"), "the feed count is on the page");
  assert.ok(html.includes("<b>9</b> release boards"), "and the board count");
  assert.ok(html.includes("2026-11-14T13:00:58.020Z"), "the watchdog heartbeat is on the page");
  assert.ok(html.includes("HTTP 200"), "and the site check result");
  assert.ok(html.includes("<b>OK</b>"), "with the fresh judgment");
  assert.ok(html.includes("2026-11-14T13:01:00.000Z"), "and the snapshot time, so a later reader knows how old it is");
  assert.ok(html.includes("nothing on this page is a live reading"), "the page says it is a snapshot, not live");
});

test("a stale snapshot says STALE and never claims fresh", async () => {
  const { OUT, fs } = await freshOut();
  const { join } = await import("node:path");
  await writeStatus({ builtAt: "2026-11-14T13:01:14.633Z", feeds: 18, boards: 9, watchdog: { ...freshWatchdog(), ageMs: 884533 }, today: "2026-11-14" });
  const html = await fs.readFile(join(OUT, "status/index.html"), "utf8");
  assert.ok(html.includes("<b>STALE</b>"), "the stale judgment is on the page");
  assert.ok(!html.includes("<b>OK</b>"), "and no fresh claim sits next to it");
  assert.ok(html.includes("15 minute"), "the age at the snapshot is shown in minutes");
});

test("an unreachable watchdog says UNKNOWN and shows no heartbeat", async () => {
  // P1-4: a failed build-time fetch must not become a green that is not
  // true. The page says the watchdog was unreachable and shows no
  // heartbeat values at all.
  const { OUT, fs } = await freshOut();
  const { join } = await import("node:path");
  await writeStatus({ builtAt: "2026-11-14T13:01:14.633Z", feeds: 18, boards: 9, watchdog: { reachable: false, fetchedAt: "2026-11-14T13:01:00.000Z" }, today: "2026-11-14" });
  const html = await fs.readFile(join(OUT, "status/index.html"), "utf8");
  assert.ok(html.includes("Watchdog state: UNKNOWN"), "the page says UNKNOWN");
  assert.ok(html.includes("could not be reached when this page was built"), "and why");
  assert.ok(!html.includes("Last heartbeat:"), "with no heartbeat line to misread");
  assert.ok(!html.includes("<b>OK</b>"), "and no green anywhere");
  assert.ok(html.includes("2026-11-14T13:01:14.633Z"), "the build time is still on the page");
});

test("the status page adds no second script", async () => {
  // Invariant 7: the one inline script in render.mjs is the only script
  // the site ships. The status page is static HTML; a live fetch from a
  // reader's browser would need a second one.
  const { OUT, fs } = await freshOut();
  const { join } = await import("node:path");
  await writeStatus({ builtAt: "2026-11-14T13:01:14.633Z", feeds: 18, boards: 9, watchdog: freshWatchdog(), today: "2026-11-14" });
  const html = await fs.readFile(join(OUT, "status/index.html"), "utf8");
  // Count executable <script> tags: match any <script ...> open tag
  // case-insensitively (CodeQL: a bare /<script>/ misses upper-case
  // <SCRIPT>), then exclude the page's JSON-LD block, a
  // <script type="application/ld+json"> data block, which is not an
  // executable script and must not count toward the one-script invariant.
  const scripts = (html.match(/<script\b[^>]*>/gi) || []).filter(
    (t) => !/type="application\/ld\+json"/i.test(t),
  );
  assert.equal(scripts.length, 1, "exactly one executable script tag — the shell's own");
  assert.ok(!html.includes("workers.dev"), "and no reference to the watchdog host anywhere on the page");
  // The shell's one script does fetch desk-status.json (same origin, the
  // long-standing freshness label); the status page itself must not add
  // another fetch — check the markup before the script tag.
  assert.ok(!html.split("<script>")[0].includes("fetch("), "no fetch call in the page markup");
});

test("the status page is joined into the nav, the footer and llms.txt", async () => {
  // The four manual joins from AGENTS.md. The sitemap join is covered by
  // the archives suite; these three are the ones a writer forgets and
  // the page goes unreachable.
  const { OUT, fs } = await freshOut();
  const { join } = await import("node:path");
  await writeStatus({ builtAt: "2026-11-14T13:01:14.633Z", feeds: 18, boards: 9, watchdog: freshWatchdog(), today: "2026-11-14" });
  const html = await fs.readFile(join(OUT, "status/index.html"), "utf8");
  // navHtml renders twice (header nav + mobile dock) and the footer dock
  // once: three links to /status/ on every page the shell renders. On the
  // status page itself the nav links carry aria-current="page", so the
  // match has to allow attributes between the href and the label.
  assert.equal((html.match(/href="\/status\/"[^>]*>Status<\/a>/g) || []).length, 3, "header nav, mobile dock and footer dock all link /status/");
  // The sitemap join is covered by the archives suite; the llms.txt join
  // is checked behaviourally: writeLlms writes it, so read the built file.
  const { writeLlms } = await import("../scripts/desk/site-home.mjs");
  await writeLlms([], []);
  const llms = await fs.readFile(join(OUT, "llms.txt"), "utf8");
  assert.ok(llms.includes("/status/"), "llms.txt lists /status/");
  assert.ok(llms.includes("desk health"), "and says what it is");
});
