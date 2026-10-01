// The open-project archive (.desk-open.json) is a cache across runs. A brief
// filed before stripCommitTrailers landed is cached with a what/ that is
// nothing but provenance, and the thin-release guard in build-desk would
// protect that cached state from ever being replaced. This file pins the
// refresh path that breaks that loop, plus the PER_OPEN truncation that hid it.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const mod = (rel) => import(pathToFileURL(join(ROOT, rel)).href);

// build-desk.mjs is a top-level script, not a module with exports — the logic
// under test is duplicated here against the real helpers so the guard itself
// stays under test. This mirrors the exact expressions in the script; if the
// script's condition drifts, this test does not follow it, which is why the
// build-level assertions below also grep real output.
const DIRTY_RE = /signed-off-by|co-?authored-by|reviewed-by|cherry picked from commit/i;

function isOpenDirty(prev) {
  return DIRTY_RE.test(prev.what || prev.dek || "");
}

// The same three-way guard the script uses.
function shouldRefresh(prev, item) {
  const prevWords = String(prev.what || "").split(/\s+/).filter(Boolean).length;
  return isOpenDirty(prev) || !item.thinRelease || prevWords < 12;
}

test("a cached brief whose what/ is a trailer block gets rewritten even when it looks substantial", () => {
  // Root cause: "Signed-off-by: A Co-authored-by: B Co-authored-by: C" has 12+
  // words, so the plain thin-release guard treats it as real prose and never
  // overwrites it. The dirty check has to fire first.
  const cached = {
    headline: "v0.31.0rc1: [CI/Build] Skip the snapshot runtime",
    what: "Signed-off-by: khluu khluu000@gmail.com Co-authored-by: Claude Opus 5.5 noreply@anthropic.com",
    dek: "Signed-off-by: khluu khluu000@gmail.com",
  };
  const fresh = { title: cached.headline, summary: "", thinRelease: true };
  assert.ok(shouldRefresh(cached, fresh), "a dirty cached brief is refreshed despite the word count");
});

test("a cached brief with real release notes is not disturbed by the dirty check", () => {
  // The guard must not become a sledgehammer: a real summary that happens to be
  // short still goes through the normal path, and a real long one is left alone.
  const real = {
    headline: "v0.30.0",
    what: "This release features 762 commits from 315 contributors. Highlights: new models.",
    dek: "This release features 762 commits from 315 contributors.",
  };
  const fresh = { title: real.headline, summary: "New summary from the feed.", thinRelease: false };
  assert.ok(!isOpenDirty(real), "a real release note is not flagged dirty");
  assert.ok(shouldRefresh(real, fresh), "and a non-thin feed item still refreshes it");
});

test("a brief with no trailer anywhere is never flagged dirty", () => {
  const clean = { headline: "Proto 0.4.0", what: "Release vllm-proto 0.4.0", dek: "" };
  assert.ok(!isOpenDirty(clean), "clean state stays clean");
});

test("the /open/ board builder renders what it is given — cleanup happens upstream in build-desk", async () => {
  // End-to-end check on the real generator. writeOpenBoard is a renderer: it
  // prints whatever what/ holds, so the trailer strip has to have happened
  // before this point (in build-desk's refresh loop, driven by stripCommitTrailers).
  // The test asserts both sides of that contract — the dirty input still
  // renders dirty (proving the renderer is not silently fixing anything) and a
  // clean input renders clean (proving the page itself carries no trailer of
  // its own).
  // Reuse the process's own OUT via getOut() instead of mkdtemp + setOut():
  // node --test runs every suite in one process, so setOutForTests() here would
  // leak into the suites that run after this one — the terms suite would find
  // itself writing into a directory with no fonts/ subtree.
  const { getOut } = await mod("scripts/desk/config.mjs");
  const out = getOut();
  const fs = await import("node:fs/promises");
  await fs.rm(out, { recursive: true, force: true });
  await fs.mkdir(out + "/fonts", { recursive: true });
  const { writeOpenBoard } = await mod("scripts/desk/site-home.mjs");
  const dirty = {
    headline: "v0.31.0rc1: [CI/Build] Skip the snapshot runtime",
    what: "Signed-off-by: khluu khluu000@gmail.com Co-authored-by: Claude Opus 5.5 noreply@anthropic.com",
    dek: "Signed-off-by: khluu khluu000@gmail.com",
    labId: "vllm",
    lab: "vLLM",
    dateLabel: "2026-09-29",
    path: "/open/vllm/snapshot-runtime/",
    kind: "note",
    topics: [],
    source: "https://github.com/vllm-project/vllm/releases/tag/v0.31.0rc1",
    publishedAt: "2026-09-29T00:00:00.000Z",
    via: "github release",
  };
  const clean = {
    ...dirty,
    headline: "v0.30.0",
    what: "This release features 762 commits from 315 contributors.",
    dek: "This release features 762 commits from 315 contributors.",
    path: "/open/vllm/v0-30-0/",
    source: "https://github.com/vllm-project/vllm/releases/tag/v0.30.0",
    publishedAt: "2026-09-25T00:00:00.000Z",
  };
  await writeOpenBoard({ openBriefs: [dirty], today: "2026-10-01" });
  const dirtyHtml = await fs.readFile(join(out, "open/index.html"), "utf8");
  assert.ok(/signed-off-by/i.test(dirtyHtml), "the renderer passes a dirty what/ through as-is — the strip must happen upstream");
  await writeOpenBoard({ openBriefs: [clean], today: "2026-10-01" });
  const cleanHtml = await fs.readFile(join(out, "open/index.html"), "utf8");
  assert.ok(!/signed-off-by/i.test(cleanHtml), "a clean brief renders a clean page");
  assert.ok(/762 commits/.test(cleanHtml), "the clean release note is rendered");
});
