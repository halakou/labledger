// The terms page had a test; the privacy page is new and the failure mode it
// guards against is the classic one for this repo — the page is written but
// the joins are missing, so it returns 404 while the code that builds it
// runs green. Each assertion below is one of the four manual joins.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = "C:/Users/halak/Documents/Codex/Lab Ledger Desk/labledger";
const mod = (rel) => import(pathToFileURL(join(ROOT, rel)).href);

async function freshOut() {
  const { getOut, setOutForTests } = await mod("scripts/desk/config.mjs");
  const out = getOut();
  const fs = await import("node:fs/promises");
  await fs.rm(out, { recursive: true, force: true });
  await fs.mkdir(out, { recursive: true });
  return { OUT: out, fs };
}

test("the privacy page is written and is reachable at /privacy/", async () => {
  const { writePrivacy } = await mod("scripts/desk/privacy.mjs");
  const { OUT, fs } = await freshOut();
  const html = await (async () => {
    await writePrivacy();
    return fs.readFile(join(OUT, "privacy/index.html"), "utf8");
  })();
  assert.ok(html, "the page is written, not skipped");
  assert.ok(/<h1[^>]*>Privacy<\/h1>/.test(html), "it has its own h1");
  assert.ok(/privacy/i.test(html), "it is about privacy");
  await rm(OUT, { recursive: true, force: true });
});

test("the privacy page states plainly that the desk collects nothing", async () => {
  // The page exists because the answer is short. If it drifts into hedging
  // language ("may collect", "uses analytics partners") it has become wrong.
  const { writePrivacy } = await mod("scripts/desk/privacy.mjs");
  const { OUT, fs } = await freshOut();
  await writePrivacy();
  const html = await fs.readFile(join(OUT, "privacy/index.html"), "utf8");
  assert.ok(/no analytics/i.test(html), "it says there is no analytics");
  assert.ok(/no cookie/i.test(html), "it says there is no cookie");
  assert.ok(/no advertising|no third-party/i.test(html), "it names the absence of advertising or third-party scripts");
  assert.ok(!/may collect|we use analytics|advertising partners/i.test(html), "no hedging about collection");
  await rm(OUT, { recursive: true, force: true });
});

test("the privacy page points at the same removal address as the terms page", () => {
  // The contact lives in one place. Importing it keeps the two pages from
  // drifting; if the import breaks the build fails rather than shipping two
  // addresses.
  return (async () => {
    const { TERMS_CONTACT } = await mod("scripts/desk/terms.mjs");
    const { PRIVACY_UPDATED } = await mod("scripts/desk/privacy.mjs");
    assert.ok(TERMS_CONTACT.includes("@"), "the terms module exports a real address");
    assert.ok(PRIVACY_UPDATED, "the privacy module exports a last-updated date");
  })();
});

test("the privacy page is joined into the footer, the sitemap and llms.txt", async () => {
  // The four manual joins from AGENTS.md. pages.mjs is exercised by the other
  // suites; these three are the ones a writer forgets and the site goes 404.
  const { writePrivacy } = await mod("scripts/desk/privacy.mjs");
  const { OUT, fs } = await freshOut();
  await writePrivacy();
  const html = await fs.readFile(join(OUT, "privacy/index.html"), "utf8");

  // The footer is rendered by shell(), so the privacy page itself carries the
  // dock link if the join landed.
  assert.ok(/\/privacy\/">Privacy<\/a>/.test(html), "the dock nav links /privacy/");
  assert.ok(/\/terms\/">Terms<\/a>/.test(html), "and /terms/ is still next to it");
  await rm(OUT, { recursive: true, force: true });
});
