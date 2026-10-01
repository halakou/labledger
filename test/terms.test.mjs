import test from "node:test";
// Tests build into a throwaway OUT. The checkout's real dist-site holds long
// paths the Windows test runner cannot always delete, so it never touches it.
import { setOutForTests } from "../scripts/desk/config.mjs";
setOutForTests(join(tmpdir(), "desk-test-out-" + Buffer.from(import.meta.url + process.pid).toString("hex").slice(0, 12)));
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { writeTerms, TERMS_CONTACT } from "../scripts/desk/terms.mjs";
import { getOut } from "../scripts/desk/config.mjs";
import { writeLlms } from "../scripts/desk/site-home.mjs";
import { CHANNEL } from "../scripts/desk/core.mjs";

async function buildOne(fn) {
  // publishSite clears OUT, so a focused test has to as well.
  await fs.rm(getOut(), { recursive: true, force: true });
  await fs.mkdir(getOut(), { recursive: true });
  await fn();
}

test("the terms page exists, has one h1, and names the removal address", async () => {
  // C5: /terms/, /privacy/ and /legal/ all 404'd, so an aggregator with no
  // good-faith removal path. The page is linked from the footer now.
  await buildOne(() => writeTerms({ today: "2026-10-01" }));
  const html = await fs.readFile(join(getOut(), "terms/index.html"), "utf8");
  assert.equal((html.match(/<h1[^>]*>/g) || []).length, 1, "exactly one h1");
  assert.ok(html.includes("<h1>Terms and removals</h1>"));
  assert.ok(html.includes(TERMS_CONTACT), "the removal address is on the page");
  assert.ok(html.includes("SECURITY.md"), "security reports are routed away from the removal address");
});

test("the terms page makes no legal conclusion", async () => {
  await buildOne(() => writeTerms({ today: "2026-10-01" }));
  const html = await fs.readFile(join(getOut(), "terms/index.html"), "utf8");
  // House policy, not a legal opinion. These words would make it read like one.
  for (const word of ["fair use", "fair dealing", "transformative", "infringement", "copyright holder"]) {
    assert.ok(!html.toLowerCase().includes(word), "the page must not assert the legal term: " + word);
  }
  assert.ok(html.toLowerCase().includes("not legal advice"));
});

test("the terms page is joined everywhere a crawler or a reader looks", async () => {
  // The four-join trap: a page that builds but lands in none of them is
  // invisible. This asserts all four for /terms/ in one place.
  const { shell } = await import("../scripts/desk/render.mjs");
  const foot = shell({ title: "t", description: "d", path: "/terms/", body: "" });
  assert.ok(foot.includes('href="/terms/">Terms</a>'), "the footer links /terms/");

  await buildOne(() => writeTerms({ today: "2026-10-01" }));
  const termsHtml = await fs.readFile(join(getOut(), "terms/index.html"), "utf8");
  assert.ok(termsHtml.includes('href="/method/"'), "the terms page links back to the method");

  // sitemap + llms.txt are written by archives.mjs/site-home.mjs from lists the
  // terms page cannot see; assert the join is present in the source instead.
  const archives = await fs.readFile(join(import.meta.dirname, "../scripts/desk/archives.mjs"), "utf8");
  assert.ok(archives.includes('["/terms/", today]'), "archives.mjs lists /terms/ in the sitemap");
  const home = await fs.readFile(join(import.meta.dirname, "../scripts/desk/site-home.mjs"), "utf8");
  assert.ok(home.includes("SITE + \"/terms/"), "site-home.mjs lists /terms/ in llms.txt");
});
