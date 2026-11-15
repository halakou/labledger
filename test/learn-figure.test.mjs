import test from "node:test";
// Regression tests for the "figure" guide section kind: a heading plus a
// desk-authored inline SVG diagram with an escaped caption. The SVG is
// trusted markup (same pattern as the MARK constant in learn.mjs), never
// user input, so it is inserted raw — and must therefore never reference
// anything outside the page: no external URL, no embedded image.
import { setOutForTests, getOut } from "../scripts/desk/config.mjs";
import { join } from "node:path";
import { tmpdir } from "node:os";
setOutForTests(join(tmpdir(), "desk-test-out-" + Buffer.from(new URL(import.meta.url).pathname.split("/").pop() + "-" + process.pid).toString("hex")));
import assert from "node:assert/strict";

async function freshOut() {
  const { getOut } = await import("../scripts/desk/config.mjs");
  const out = getOut();
  const fs = await import("node:fs/promises");
  await fs.rm(out, { recursive: true, force: true });
  await fs.mkdir(out + "/fonts", { recursive: true });
  return { OUT: out, fs };
}

test("figure sections render inline SVG with a caption, no external refs", async () => {
  const { writeLearn } = await import("../scripts/desk/learn.mjs");
  const { OUT, fs } = await freshOut();
  await writeLearn();
  const html = await fs.readFile(join(OUT, "learn", "ai-agents-that-act", "index.html"), "utf8");
  const figures = html.match(/<figure class="g-figure">[\s\S]*?<\/figure>/g) || [];
  assert.equal(figures.length, 2, "the guide must render exactly two figures");
  for (const f of figures) {
    assert.ok(f.includes("<svg "), "each figure must contain an inline SVG");
    assert.ok(f.includes("<figcaption>"), "each figure must carry a caption");
    assert.ok(!/https?:\/\//.test(f), "a figure must not reference an external URL");
    assert.ok(!/<image/.test(f), "a figure must not embed an external image");
    assert.ok(!/xlink:href/.test(f), "a figure must not link out");
  }
  assert.ok(html.includes('viewBox="0 0 760 162"'), "the loop diagram must be present");
  assert.ok(html.includes('viewBox="0 0 760 178"'), "the gate diagram must be present");
  assert.ok(html.includes('href="#the-loop-drawn-out"'), "figure headings belong in the TOC");
  assert.ok(html.includes('href="#the-gate-drawn-out"'), "figure headings belong in the TOC");
});
