import test from "node:test";
import assert from "node:assert/strict";
import {
  parseFeed,
  decode,
  strip,
  stripCommitTrailers,
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
  factsFor,
  presentRelease,
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
  assert.equal(decode("&#128640;"), "🚀");
  assert.equal(decode("&#x1F916;"), "🤖");
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

test("strip closes the two bypasses CodeQL's bad-tag-filter names", () => {
  // The nested-tag bypass: removing the inner pair re-forms the outer tag.
  // "<scr<script>ipt>" -> inner "<script>" gone -> "scr" + "ipt>" -> "<script>"
  // unless the loop repeats and catches the recombination.
  assert.ok(!/<\s*script/i.test(strip("<scr<script>ipt>alert(1)</script>ipt>")), "a nested tag cannot re-form");
  assert.ok(!/<\s*style/i.test(strip("<sty<style>le>x{}</style>le>")), "nor a nested style");
  // The malformed-close bypass, straight out of the CodeQL query help: browsers
  // accept "</scriptfoo=\"bar\">" as a script end tag, so a pattern that only
  // matches a clean "</script>" leaves the script body behind. Matching the
  // close generically as "</[^<>]*>" is what closes it.
  assert.equal(strip("<script>alert(1)</scriptfoo=\"bar\">"), "", "a malformed close still ends the element");
  // An unterminated tag has no ">" for a tag match to find.
  assert.equal(strip("<img src=x onerror=alert(1)"), "", "an unterminated tag is cleared");
  // Text between elements survives — this is a news desk, prose is the product.
  assert.equal(strip("<p>one</p><p>two</p>"), "one two");
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

test("stripCommitTrailers removes signed-off-by and co-author provenance from briefs", () => {
  // C-item 1: GitHub release notes are the squash-commit message, so the feed's
  // <content> ends in a trailer block. It is provenance, not a summary, and it
  // renders as a broken sentence in a 100-word brief.
  const withTrailers = "Release v1.2.0 fixes the queue stall.\n\nSigned-off-by: Alice <alice@example.com>\nCo-authored-by: Bob <bob@example.com>";
  assert.equal(
    stripCommitTrailers(withTrailers),
    "Release v1.2.0 fixes the queue stall",
    "the whole trailing block is cut at the first trailer line"
  );
  const inline = "Adds a retry. Signed-off-by: Alice <alice@example.com> Then a note.";
  const got = stripCommitTrailers(inline);
  assert.ok(!/signed-off/i.test(got), "no signed-off-by anywhere in the result");
  assert.ok(got.includes("Adds a retry"), "the body before it survives, terminator included");
  assert.equal(stripCommitTrailers(""), "", "empty input stays empty");
  assert.equal(
    stripCommitTrailers("Nothing provenance-like here."),
    "Nothing provenance-like here.",
    "plain text is untouched"
  );
});

test("stripCommitTrailers returns empty for a pure trailer block, so the fallback can write the brief", () => {
  // A real GitHub release note is often nothing but the squash-commit trailer
  // run. Cutting at the first trailer yields "" here, which is the intent:
  // presentRelease sees a thin release and writes a sentence naming the lab,
  // the version and the feed — better than provenance rendered as prose.
  const onlyTrailers = "Signed-off-by: Robert Shaw <a href=\"mailto:robshaw@redhat.com\">robshaw@redhat.com</a><br>\nCo-authored-by: Claude Opus 5.5 noreply@anthropic.com (cherry picked from commit abc123)";
  assert.equal(stripCommitTrailers(onlyTrailers), "", "a pure trailer block has no prose to keep");
});

test("stripCommitTrailers handles raw GitHub HTML: <br> separators, mailto anchors, cherry-pick lines", () => {
  // The feed's <content> is HTML-encoded; parseFeed's strip() removes the tags
  // before this runs, but the function must not misfire on the raw shape either,
  // because the same helper is what the word-count guard in build-desk.mjs leans
  // on. The <br> between trailers is the real-world separator; a mailto anchor
  // puts a literal ">" right before a trailer keyword, which is the case the
  // tag-boundary alternative exists for.
  const html = "<p>Fixes the queue stall.</p><br>\nSigned-off-by: Alice &lt;a href=\"mailto:alice@example.com\"&gt;alice@example.com&lt;/a&gt;<br>Co-authored-by: Bob noreply@bots.github";
  const got = stripCommitTrailers(html);
  assert.ok(/Fixes the queue stall/.test(got), "the release note survives");
  assert.ok(!/signed-off/i.test(got), "no signed-off-by");
  assert.ok(!/co-?authored/i.test(got), "no co-authored-by");
  assert.ok(!/cherry picked/i.test(got), "no cherry-pick line");
});

test("stripCommitTrailers does not cut a sentence that merely mentions signing off", () => {
  // A maintainer saying "the patch was signed off by the reviewer" is prose,
  // not provenance. The keyword list requires the hyphenated "signed-off-by"
  // form, so plain prose mentioning signing survives untouched.
  const prose = "The patch was signed off by the maintainer after two rounds of review.";
  assert.equal(
    stripCommitTrailers(prose),
    prose,
    "prose mentioning signing off is not a trailer"
  );
});

test("stripCommitTrailers drops prose after the first trailer — locked decision", () => {
  // LOCKED: drop-from-first-trailer, not preserve. Anything after the first
  // trailer keyword is part of the same squash-commit message, not a summary of
  // the release: "Then a note." there is continuation of the commit body, never
  // a description a reader came for. If this test fails, the policy changed and
  // every other test in this file that depends on it must be reviewed.
  const withTail = "Adds a retry. Signed-off-by: Alice <alice@example.com> Then a note about the queue.";
  const got = stripCommitTrailers(withTail);
  assert.ok(got.startsWith("Adds a retry"), "the sentence before the trailer survives");
  assert.ok(!/Then a note/.test(got), "prose after the first trailer is dropped, not preserved");
  assert.ok(!/signed-off/i.test(got), "and the trailer itself is gone");
});

test("slugify truncates at a word boundary, not mid-word", () => {
  // C-item 2: a URL that cuts a word in half is a different address than the
  // one a reader pastes back. The slug must end on a hyphen between words,
  // never on a dangling fragment.
  const out = slugify("ComfyUI releases version 0.3.8.1 with a long tail of details");
  assert.ok(out.length <= 72, "stays inside the limit");
  assert.ok(/^[a-z0-9-]+$/.test(out), "slug-safe characters only");
  assert.ok(!out.endsWith("-"), "no trailing hyphen");
  // The clearest failure mode of a mid-word cut is a fragment that ends
  // inside a word: "comfyui-v0-38-1-relea". Splitting back on the hyphens,
  // every chunk must be a whole word/token that appeared in the title.
  const chunks = out.split("-").filter(Boolean);
  for (const c of chunks) {
    assert.ok(
      ["comfyui", "releases", "version", "0", "3", "8", "1", "with", "a", "long", "tail", "of", "details"].includes(c),
      "chunk is a whole word from the title, not a fragment: " + c
    );
  }
});

test("slugify does not leave a half-word at the cut on a real 82-character title", () => {
  // A real title from the Anthropic feed: the naive slice(0, 72) produced
  // "...kernel-expertise-to-appl", cutting "Apple" in half. The fix lands on
  // the last full word inside the budget instead.
  const out = slugify("From CUDA to MLX: How K-Search Brings Decades of Kernel Expertise to Apple Silicon");
  assert.ok(out.length <= 72, "stays inside the limit");
  assert.ok(!out.endsWith("-"), "no trailing hyphen");
  // Every hyphen-separated chunk is a whole token from the title, never a
  // fragment like "appl".
  const allowed = new Set(["from", "cuda", "to", "mlx", "how", "k", "search", "brings", "decades", "of", "kernel", "expertise", "apple", "silicon"]);
  const chunks = out.split("-").filter(Boolean);
  for (const c of chunks) {
    assert.ok(allowed.has(c), "no half-word fragment at the cut: " + c);
  }
});

test("slugify still truncates a single very long word rather than exceeding the limit", () => {
  // A title with one very long word and no spaces has no word boundary to land
  // on, so the cap wins: the slug is the first 72 characters and that is the
  // correct behaviour — returning the whole word would make a URL longer than
  // the budget every site page is written against.
  const out = slugify("supercalifragilisticexpialidociousreleaseannouncement");
  assert.ok(out.length <= 72, "a word longer than the limit is still truncated");
  assert.equal(out, "supercalifragilisticexpialidociousreleaseannouncement".slice(0, out.length));
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
  const why = composeWhy("OpenAI", "2026-09-26", "launch", ["llm"]);
  assert.ok(why.includes("launch"));
  assert.ok(why.includes("OpenAI"));
});

test("composeWhy is the same plain record for every brief, so it never reads machine-generated", () => {
  // C3: the old five-shape rotation produced five near-identical restatements
  // of lab/date/kind and no actual "why". One plain sentence, always the same
  // shape, is honest about what the desk knows — and never invented a claim.
  const a = composeWhy("OpenAI", "2026-09-26", "launch", ["llm"]);
  const b = composeWhy("Anthropic", "2026-09-27", "research", []);
  assert.ok(a.includes("launch"));
  assert.ok(a.includes("OpenAI"));
  assert.ok(b.includes("research"));
  assert.ok(b.includes("Anthropic"));
  assert.equal(a.includes("secret invented claim"), false);
  assert.equal(b.includes("secret invented claim"), false);
  // The shape is stable; only the facts it names change.
  assert.equal(a.startsWith("Filed as a launch filing from OpenAI, 2026-09-26."), true);
  assert.equal(b.startsWith("Filed as a research filing from Anthropic, 2026-09-27."), true);
  // Topics are attributed to the desk's own tagging, never to the source.
  assert.ok(a.includes("The desk tags this brief"));
  assert.equal(b.includes("tags this brief"), false);
});

test("factsFor does not write a doubled article before names that already start with The", () => {
  const facts = factsFor({
    lab: "The Verge",
    via: "feed",
    source: "https://www.theverge.com/story",
    dateLabel: "26 Sep 2026",
    what: "A short claim that is long enough to count as a sentence for the facts list.",
  });
  assert.match(facts[0], /^Filed from The Verge /);
  assert.doesNotMatch(facts[0], /the The/);
});

test("factsFor names a GitHub release feed instead of calling it RSS", () => {
  const facts = factsFor({
    lab: "vLLM",
    via: "github release",
    source: "https://github.com/vllm-project/vllm/releases/tag/v0.1.0",
    dateLabel: "26 Sep 2026",
    what: "A short claim that is long enough to count as a sentence for the facts list.",
  });
  assert.match(facts[0], /official GitHub releases feed/);
  assert.doesNotMatch(facts[0], /official RSS/);
});

test("presentRelease names the project on a version-only title and does not invent notes", () => {
  const out = presentRelease("vLLM", { title: "v0.34.3", summary: "", link: "https://github.com/vllm-project/vllm/releases/tag/v0.34.3" });
  assert.equal(out.title, "vLLM v0.34.3");
  assert.equal(out.thinRelease, true);
  assert.match(out.summary, /did not include notes/);
  assert.doesNotMatch(out.summary, /faster|benchmark|feature/i);
});

test("presentRelease keeps real release notes", () => {
  const notes = "Fixes a scheduler crash when the batch is empty. Adds a metric for queue wait.";
  const out = presentRelease("vLLM", { title: "Scheduler fix", summary: notes });
  assert.equal(out.title, "Scheduler fix");
  assert.equal(out.thinRelease, false);
  assert.equal(out.summary, notes);
});

test("composeWhy names the filing kind a note, not a launch or research claim", () => {
  const why = composeWhy("Mistral", "2026-09-28", "note", ["open"]);
  assert.ok(why.includes("public note"));
  assert.ok(why.includes("Open models"), "topics render as labels, not as raw ids");
});
