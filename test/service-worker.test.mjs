import test from "node:test";
// Tests build into a throwaway OUT. The checkout's real dist-site holds long
// paths the Windows test runner cannot always delete, so it never touches it.
import { setOutForTests, getOut } from "../scripts/desk/config.mjs";
import { join } from "node:path";
import { tmpdir } from "node:os";
setOutForTests(join(tmpdir(), "desk-test-out-" + Buffer.from(new URL(import.meta.url).pathname.split("/").pop() + "-" + process.pid).toString("hex")));
import assert from "node:assert/strict";

// writeStatic copies font files into OUT/fonts, so a focused test has to
// clear OUT and recreate both the root and the fonts directory, exactly the
// way publishSite does. (Same helper as site-home.test.mjs.)
async function freshOut() {
  const { getOut } = await import("../scripts/desk/config.mjs");
  const out = getOut();
  const fs = await import("node:fs/promises");
  await fs.rm(out, { recursive: true, force: true });
  await fs.mkdir(out + "/fonts", { recursive: true });
  return { OUT: out, fs };
}

async function builtSw() {
  const { writeStatic } = await import("../scripts/desk/site-home.mjs");
  const { OUT, fs } = await freshOut();
  await writeStatic([]);
  return fs.readFile(join(OUT, "sw.js"), "utf8");
}

async function builtHeaders() {
  const { writeLlms } = await import("../scripts/desk/site-home.mjs");
  const { OUT, fs } = await freshOut();
  await writeLlms([], []);
  return fs.readFile(join(OUT, "_headers"), "utf8");
}

// Split _headers into { path, directives[] } blocks: a line with no leading
// whitespace opens a block; indented lines are its directives.
function headerBlocks(headers) {
  const blocks = [];
  for (const line of headers.split("\n")) {
    if (line === "") continue;
    if (/^\S/.test(line)) blocks.push({ path: line, directives: [] });
    else if (blocks.length) blocks[blocks.length - 1].directives.push(line.trim());
  }
  return blocks;
}

function cacheControls(block) {
  return block.directives.filter((d) => d.startsWith("Cache-Control:"));
}

test("the service worker is network-first for documents, cache-first only for versioned assets", async () => {
  // 2026-11-16 mobile bug: the old handler served a six-week-old cached
  // page whose hashed stylesheet no longer exists, so the page rendered
  // with no CSS at all. Documents must come from the network whenever it
  // is reachable; the cache is only the offline fallback.
  const sw = await builtSw();
  assert.doesNotThrow(() => new Function(sw), "the generated sw.js must parse");
  assert.ok(sw.includes("const CACHE='desk-v2';"), "the cache name is bumped so activate() drops desk-v1");
  assert.ok(!sw.includes("desk-v1"), "no reference to the old cache survives");
  assert.ok(sw.includes("e.respondWith(network.catch(function(){return cached;}));"), "documents are network-first with the cache as fallback");
  assert.ok(!sw.includes("e.respondWith(cached.then(function(r){return r||network;}));"), "the old cache-first document line is gone");
  assert.ok(sw.includes("fetch(req,{cache:'reload'})"), "the document fetch bypasses the browser HTTP cache, so a stale copy there cannot satisfy it");
  assert.ok(sw.includes("if(ASSET.test(u.pathname)){e.respondWith(cached.then(function(r){return r||fetch(req);}));return;}"), "versioned assets stay cache-first: their names change with their content, so a cached copy is never stale");
});

test("search-index.json rides the document path, not the asset path", async () => {
  // PR #48's Desk Editor flagged this: the index does not match the SW's
  // ASSET pattern, so under the old worker it was fetched as a document —
  // and a returning visitor could be served a stale index. Under the new
  // network-first handler it is covered automatically, because it is a
  // document request. Pin the pattern itself, not a copy of it: extract the
  // ASSET regex the build actually emits and run it against real paths.
  const sw = await builtSw();
  const m = sw.match(/const ASSET=(\/[^;]+\/);/);
  assert.ok(m, "the generated sw.js carries the ASSET pattern");
  const asset = new RegExp(m[1].slice(1, -1));
  assert.equal(asset.test("/search-index.json"), false, "the index is not a versioned asset");
  assert.equal(asset.test("/search/"), false, "a document path is not an asset");
  assert.equal(asset.test("/b/2026/11/16/some-brief/"), false, "a brief page is not an asset");
  assert.equal(asset.test("/learn/"), false, "a guide page is not an asset");
  assert.equal(asset.test("/styles-ace304d7ad54.css"), true, "a hashed stylesheet is an asset");
  assert.equal(asset.test("/sprite-9fdbf4c6b825.svg"), true, "a hashed sprite is an asset");
  assert.equal(asset.test("/fonts/fraunces-600.woff2"), true, "a vendored font is an asset");
  assert.equal(asset.test("/og.jpg"), false, "the unhashed fallback card is not a versioned asset");
});

test("the _headers file emits exactly one Cache-Control per path", async () => {
  // 2026-11-16: the global /* block emitted a Cache-Control AND every
  // per-asset rule emitted its own, so Cloudflare Pages merged them and the
  // live CSS carried two contradictory directives ("max-age=0,
  // must-revalidate, stale-while-revalidate=86400" plus "max-age=31536000,
  // immutable"). A path must match exactly one rule that sets Cache-Control.
  const headers = await builtHeaders();
  assert.ok(!headers.includes("stale-while-revalidate"), "stale-while-revalidate is gone: a desk rebuilding every ~15 minutes must not serve a day-old page from any cache");
  const blocks = headerBlocks(headers);
  for (const block of blocks) {
    assert.ok(cacheControls(block).length <= 1, block.path + " carries " + cacheControls(block).length + " Cache-Control directives");
  }
  const global = blocks.find((b) => b.path === "/*");
  assert.ok(global, "the global block still exists");
  assert.equal(cacheControls(global).length, 0, "the global block sets no Cache-Control of its own");
  const swBlock = blocks.find((b) => b.path === "/sw.js");
  assert.ok(swBlock, "the sw.js rule still exists");
  assert.deepEqual(cacheControls(swBlock), ["Cache-Control: public, max-age=0, must-revalidate"], "sw.js itself is always revalidated, so a new worker is picked up within a day");
  const cssBlock = blocks.find((b) => b.path.endsWith(".css"));
  assert.ok(cssBlock, "the hashed stylesheet rule still exists");
  assert.equal(cacheControls(cssBlock).length, 1, "the stylesheet carries exactly one Cache-Control");
  assert.ok(cacheControls(cssBlock)[0].includes("immutable"), "the hashed stylesheet stays immutable");
});

test("search-index.json gets a short cache leash of its own", async () => {
  // The index rebuilds with every build. A direct fetch — before the
  // worker controls the page — must never sit on a stale copy, so it gets
  // the same 60-second rule as desk-status.json.
  const headers = await builtHeaders();
  const blocks = headerBlocks(headers);
  const indexBlock = blocks.find((b) => b.path === "/search-index.json");
  assert.ok(indexBlock, "the search-index.json rule exists");
  assert.deepEqual(cacheControls(indexBlock), ["Cache-Control: public, max-age=60, must-revalidate"], "the index is revalidated after a minute");
  assert.ok(indexBlock.directives.includes("Content-Type: application/json; charset=utf-8"), "the index is served as JSON");
});
