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
  assert.ok(html.includes("Brief 042"));
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

test("shell defaults to English and honours the lang option", () => {
  const en = shell({ title: "t", description: "d", path: "/", body: "" });
  assert.ok(en.includes('<html lang="en" dir="ltr">'));
  const fa = shell({ title: "t", description: "d", path: "/fa/", body: "", lang: "fa" });
  assert.ok(fa.includes('<html lang="fa" dir="rtl">'));
});

test("shell emits hreflang alternates only when more than one language is listed", () => {
  const one = shell({ title: "t", description: "d", path: "/", body: "", alternates: [["en", "https://x/"]] });
  assert.ok(!one.includes('hreflang="en"'), "a single-language page carries no hreflang rows");
  const two = shell({
    title: "t",
    description: "d",
    path: "/",
    body: "",
    alternates: [
      ["en", "https://x/"],
      ["fa", "https://x/fa/"],
    ],
  });
  assert.ok(two.includes('hreflang="en"'));
  assert.ok(two.includes('hreflang="fa"'));
  assert.ok(two.includes('hreflang="x-default"'));
});

test("the inline script registers the service worker", () => {
  assert.ok(SEARCH_SCRIPT.includes("serviceWorker"), "the one script must register /sw.js");
  assert.ok(SEARCH_SCRIPT.includes("register('/sw.js')"));
});
