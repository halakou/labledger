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
