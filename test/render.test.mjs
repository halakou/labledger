import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { shell, rowHtml, SEARCH_SCRIPT, SEARCH_SCRIPT_HASH } from "../scripts/desk/render.mjs";

test("the CSP hash matches the script that actually ships", () => {
  const expected = createHash("sha256").update(SEARCH_SCRIPT, "utf8").digest("base64");
  assert.equal(SEARCH_SCRIPT_HASH, expected);
});

test("shell emits the exact script the CSP allows", () => {
  const html = shell({ title: "t", description: "d", path: "/", body: "<main></main>" });
  assert.ok(html.includes("<script>" + SEARCH_SCRIPT + "</script>"), "script must ship verbatim");
  assert.equal(html.includes("onclick="), false);
});

test("shell can mark a page noindex without changing the default", () => {
  const hidden = shell({ title: "t", description: "d", path: "/404.html", body: "", robots: "noindex, follow" });
  assert.ok(hidden.includes('content="noindex, follow"'));
  const shown = shell({ title: "t", description: "d", path: "/", body: "" });
  assert.ok(shown.includes('content="index,follow,max-image-preview:large"'));
});

test("the one script also copies donate addresses and does not use inline handlers", () => {
  assert.ok(SEARCH_SCRIPT.includes("support-addr"));
  assert.ok(SEARCH_SCRIPT.includes("addEventListener"));
  assert.equal(SEARCH_SCRIPT.includes("onclick"), false);
});

test("shell escapes user-controlled title and description", () => {
  const html = shell({
    title: "<script>alert(1)</script>",
    description: "<img src=x onerror=alert(1)>",
    path: "/",
    body: "",
  });
  assert.ok(!html.includes("<script>alert(1)"), "title must be escaped");
  assert.ok(!html.includes("<img src=x"), "description must be escaped");
});

test("rowHtml escapes every field it renders", () => {
  const b = {
    lab: "La<b>b</b>",
    labId: "lab1",
    headline: 'He<i>"d</i>',
    dek: "D&d",
    kind: "launch",
    topics: ["llm"],
    path: "/b/2026/09/26/x/",
    dateLabel: "2026-09-26",
    year: "2026",
    month: "09",
    day: "26",
    briefNo: "042",
    mark: "L",
    color: "#fff",
    markFile: null,
  };
  const html = rowHtml(b);
  assert.ok(!html.includes("<b>b</b>"), "lab must be escaped");
  assert.ok(!html.includes("<i>"), "headline must be escaped");
  assert.ok(html.includes(">042<"), "brief number stays on the card");
  assert.equal(html.includes("99.1"), false, "status must not invent a score");
  assert.equal(html.includes("Cite"), true);
});

test("shell wraps the body in a <main> landmark and emits a skip link", () => {
  const html = shell({ title: "t", description: "d", path: "/", body: "<p>x</p>" });
  assert.ok(html.includes('<main id="main">'), "body must sit inside <main>");
  assert.ok(html.includes('class="skip"'), "a skip link must be the first focusable element");
  assert.ok(html.includes('href="#main"'), "skip link must target #main");
});

test("shell links the web app manifest", () => {
  const html = shell({ title: "t", description: "d", path: "/", body: "" });
  assert.ok(html.includes('<link rel="manifest" href="/manifest.webmanifest">'));
});

test("the inline script registers the service worker", () => {
  assert.ok(SEARCH_SCRIPT.includes("serviceWorker"), "the one script must register /sw.js");
  assert.ok(SEARCH_SCRIPT.includes("register('/sw.js')"));
});

test("the site is English-only: no lang switch, no rtl, no hreflang", () => {
  const html = shell({ title: "t", description: "d", path: "/", body: "" });
  assert.ok(html.includes('<html lang="en">'), "the document language is English");
  assert.ok(!html.includes('dir="rtl"'), "no right-to-left document");
  assert.ok(!html.includes("hreflang"), "no hreflang alternates");
  assert.ok(!html.includes("/fa/"), "no Persian route");
});

test("the shell ticker never ships invented telemetry", () => {
  const html = shell({ title: "t", description: "d", path: "/", body: "" });
  assert.equal(html.includes("AGI-0.9"), false);
  assert.equal(html.includes("META AI PAPER"), false);
  assert.equal(html.includes("MORE"), false);
  assert.ok(html.includes("Official sources only"));
});

test("every board source has a specialized vector mark", async () => {
  const { LABS, OPEN_PROJECTS } = await import("../scripts/desk/config.mjs");
  const { VECTOR_MARKS } = await import("../scripts/desk/marks-vector.mjs");
  const { markHtml } = await import("../scripts/desk/render.mjs");
  for (const source of [...LABS, ...OPEN_PROJECTS]) {
    assert.ok(VECTOR_MARKS.includes('id="mark-' + source.id + '"'), source.id + " needs a mark");
    const html = markHtml({ id: source.id, labId: source.id, mark: source.mark, color: source.color }, "sm", "/sprite.svg#m-" + source.id);
    assert.ok(html.includes("#mark-" + source.id), source.id + " must use its vector mark");
    assert.equal(html.includes("letter"), false, source.id + " must not fall back to a letter");
  }
});

test("shell ships a mobile dock and a live badge hook", () => {
  const html = shell({ title: "t", description: "d", path: "/", body: "" });
  assert.ok(html.includes('class="mobile-dock"'));
  assert.ok(html.includes('id="desk-live"'));
  assert.ok(SEARCH_SCRIPT.includes("/desk-status.json"));
});
