import test from "node:test";
import assert from "node:assert/strict";
import {
  parseFeed,
  decode,
  strip,
  esc,
  slugify,
  clip,
  clipSentence,
  clipWords,
  classifyKind,
  classifyTopics,
  hostAllowed,
  hostOf,
  composeWhat,
  composeWhy,
} from "../scripts/desk/core.mjs";
import { mondayOf } from "../scripts/desk/net.mjs";

test("esc escapes every HTML metacharacter and is idempotent on plain text", () => {
  assert.equal(esc("<b>x & \"y\"</b>"), "&lt;b&gt;x &amp; &quot;y&quot;&lt;/b&gt;");
  assert.equal(esc("plain text"), "plain text");
});

test("esc never leaves a raw < behind, even for hostile input", () => {
  const hostile = "<img src=x onerror=alert(1)>";
  assert.equal(esc(hostile).includes("<"), false);
});

test("decode unescapes entities and numeric character references", () => {
  assert.equal(decode("&amp;lt;"), "<");
  assert.equal(decode("&#65;"), "A");
  assert.equal(decode("&#x41;"), "A");
  assert.equal(decode("&quot;q&quot;"), '"q"');
});

test("decode stops after three rounds instead of looping forever", () => {
  // Unbounded decoding of this input would keep going past "&" to nothing;
  // the three-round cap leaves a harmless escaped remainder.
  assert.equal(decode("&amp;amp;amp;amp;X"), "&amp;X");
});

test("strip removes tags but keeps the text", () => {
  assert.equal(strip("<p>Hello <b>world</b></p>"), "Hello world");
  assert.equal(strip("<script>bad()</script>kept"), "kept");
  assert.equal(strip("  spaced   out  "), "spaced out");
});

test("parseFeed reads RSS items and forces https links", () => {
  const xml =
    "<rss><channel><item><title>A launch</title>" +
    "<link>http://example.com/a</link><guid>g1</guid>" +
    "<description>Body text here that is long enough</description>" +
    "<pubDate>Mon, 01 Sep 2025 00:00:00 GMT</pubDate></item>" +
    "<item><title></title><link>http://example.com/b</link></item>" +
    "<item><title>No link</title></item></channel></rss>";
  const items = parseFeed(xml);
  assert.equal(items.length, 1);
  assert.equal(items[0].title, "A launch");
  assert.equal(items[0].link, "https://example.com/a");
  assert.equal(items[0].guid, "g1");
  assert.equal(items[0].publishedAt instanceof Date, true);
});

test("parseFeed reads Atom entries", () => {
  const xml =
    '<feed><entry><title>Atom post</title>' +
    '<link href="https://example.com/atom" rel="alternate"/>' +
    "<id>atom-1</id><updated>2025-09-01T00:00:00Z</updated>" +
    "<summary>Summary text</summary></entry></feed>";
  const items = parseFeed(xml);
  assert.equal(items.length, 1);
  assert.equal(items[0].title, "Atom post");
  assert.equal(items[0].link, "https://example.com/atom");
});

test("parseFeed tolerates CDATA and entity-laden titles", () => {
  const xml =
    "<rss><channel><item><title><![CDATA[CDATA &amp; title]]></title>" +
    "<link>https://example.com/c</link></item></channel></rss>";
  const items = parseFeed(xml);
  assert.equal(items[0].title, "CDATA & title");
});

test("slugify makes url-safe slugs and never returns empty", () => {
  assert.equal(slugify("GPT-5 Launches!"), "gpt-5-launches");
  assert.equal(slugify("   "), "brief");
  assert.equal(slugify("یک عنوان فارسی"), "brief");
  const long = "a".repeat(200);
  assert.ok(slugify(long).length <= 72);
});

test("clip cuts at a word boundary and adds an ellipsis", () => {
  assert.equal(clip("short", 100), "short");
  const out = clip("the quick brown fox jumps over the lazy dog again and again", 30);
  assert.ok(out.endsWith("…"));
  assert.ok(out.length <= 30);
  assert.ok(out.includes(" "));
});

test("clipSentence never cuts a sentence in half", () => {
  const t = "First sentence here. Second one follows. Third and final one now.";
  const out = clipSentence(t, 40);
  // Every kept sentence is whole, and a continuation marker is appended.
  assert.ok(out.endsWith("…"));
  for (const s of out.slice(0, -2).split(/(?<=[.!?])\s+/)) {
    assert.ok(/[.!?]$/.test(s), "kept sentence should end with punctuation: " + s);
  }
  assert.equal(clipSentence("short enough.", 100), "short enough.");
});

test("clipWords respects the word budget", () => {
  const w = clipWords("one two three four five six seven eight", 4);
  assert.equal(w.split(" ").length <= 5, true);
});

test("classifyKind spots launches and research", () => {
  assert.equal(classifyKind("OpenAI launches GPT-6", "body"), "launch");
  assert.equal(classifyKind("A new paper on scaling", "we present results"), "research");
  assert.equal(classifyKind("Office hours updated", "short note"), "note");
});

test("classifyTopics tags up to two topics", () => {
  const t = classifyTopics("New GPU benchmark for medical imaging", "");
  assert.ok(t.includes("hardware"));
  assert.ok(t.includes("medical"));
  assert.ok(t.length <= 2);
});

test("hostOf refuses non-https and strips www", () => {
  assert.equal(hostOf("https://www.example.com/x"), "example.com");
  assert.equal(hostOf("http://example.com/x"), null);
  assert.equal(hostOf("not a url"), null);
});

test("hostAllowed is a strict membership check", () => {
  assert.equal(hostAllowed("https://ok.example.com/", ["ok.example.com"]), true);
  assert.equal(hostAllowed("https://evil.example.com/", ["ok.example.com"]), false);
});

test("mondayOf always lands on a Monday", () => {
  const d = mondayOf(new Date("2026-09-26T10:00:00Z"));
  assert.equal(d.getUTCDay(), 1);
  assert.equal(d.toISOString().slice(0, 10), "2026-09-21");
});

test("composeWhat keeps the source's own sentence", () => {
  const s = "We are releasing the model today. More details follow.";
  assert.equal(composeWhat(s, "OpenAI", "Headline", "2026-09-26"), s);
  const empty = composeWhat("", "OpenAI", "Headline", "2026-09-26");
  assert.ok(empty.includes("OpenAI"));
});

test("composeWhy states the filing kind without restating the summary", () => {
  const why = composeWhy("OpenAI", "2026-09-26", "launch", ["llm"], "summary text");
  assert.ok(why.includes("launch"));
  assert.ok(why.includes("OpenAI"));
  assert.ok(!why.includes("summary text"));
});
