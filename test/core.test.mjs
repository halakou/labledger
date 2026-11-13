import test from "node:test";
import assert from "node:assert/strict";
import {
  alsoFiledLine,
  boardPrimaries,
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
  clusterBriefs,
  composeWhat,
  composeWhy,
  factsFor,
  presentRelease,
  queueFromBoard,
  selectBoard,
  titleKeywords,
  titleSimilarity,
  titlesAreDuplicates,
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

// --- P0-1: duplicate-story clustering, no AI --------------------------------

test("titleKeywords drops framing verbs and stopwords and stems the rest — lab names are kept here", () => {
  // Lab names are NOT stripped at this level: whether a lab name is a
  // shared subject reference or the distinguishing subject can only be
  // decided for a pair (see the shared-name test below). "OpenAI" stays
  // in the tokens; the pairwise comparison drops it only when it occurs
  // in both titles.
  assert.deepEqual(titleKeywords("OpenAI launches GPT-6"), ["openai", "gpt-6"]);
  assert.deepEqual(titleKeywords("Introducing Gemini 4 Hydrogen"), ["gemini", "4", "hydrogen"]);
  // A version token stays whole: "v0.34.3" is one token, not "v0" + "34" + "3".
  assert.deepEqual(titleKeywords("vLLM v0.34.3"), ["vllm", "v0.34.3"]);
  // Stemming is consistent both ways: "introducing" and "introduced" meet.
  assert.deepEqual(titleKeywords("Introducing ChatGPT Wallet"), titleKeywords("ChatGPT Wallet introduced"));
  // The subject stays in the tokens either way now: the pair decides.
  assert.deepEqual(titleKeywords("NVIDIA posts record revenue"), ["nvidia", "record", "revenue"]);
});

test("titlesAreDuplicates clusters the same story filed under different titles", () => {
  // Real duplicate shapes: one story, two labs, two wordings.
  assert.equal(
    titlesAreDuplicates("Jensen Huang steps down as NVIDIA CEO", "NVIDIA", "Jensen Huang resigns as CEO of NVIDIA", "TechCrunch"),
    true,
    "steps down vs resigns is the same resignation"
  );
  assert.equal(
    titlesAreDuplicates("Introducing Gemini 4 Hydrogen", "Google", "Google launches Gemini 4 Hydrogen", "The Verge"),
    true,
    "same launch, one title names the source"
  );
  assert.equal(
    titlesAreDuplicates("Introducing ChatGPT Wallet", "OpenAI", "OpenAI launches ChatGPT Wallet", "TechCrunch"),
    true,
    "same launch, different framing verb"
  );
  // Merges on the bigram branch (Jaccard 2/3 >= 0.6), not on the subset
  // shortcut: the subset gate below does not touch this pair.
  assert.equal(
    titlesAreDuplicates("Gemini 4", "Google", "Gemini 4 Hydrogen", "Google"),
    true,
    "a shorter title for the same launch still matches"
  );
});

test("titlesAreDuplicates does not cluster different releases, however similar the title", () => {
  assert.equal(
    titlesAreDuplicates("OpenAI launches GPT-6", "OpenAI", "OpenAI launches ChatGPT Wallet", "OpenAI"),
    false,
    "same lab and verb, different product"
  );
  assert.equal(
    titlesAreDuplicates("Anthropic releases Claude Opus 5", "Anthropic", "Anthropic releases Claude Sonnet 5", "Anthropic"),
    false,
    "Opus vs Sonnet are different models, not two filings of one"
  );
  assert.equal(
    titlesAreDuplicates("vLLM v0.34.3", "vLLM", "vLLM v0.34.4", "vLLM"),
    false,
    "different patch versions are different releases (digit guard)"
  );
  assert.equal(
    titlesAreDuplicates("Claude Opus 5", "Anthropic", "Claude Opus 5.1", "Anthropic"),
    false,
    "a point release is a different release (digit guard)"
  );
  assert.equal(
    titlesAreDuplicates("Gemini 4", "Google", "Gemini 5", "Google"),
    false,
    "a different major number is a different model"
  );
  // Own-name stripping only: two revenue stories from two different
  // companies, both filed by the same press desk, must stay separate.
  assert.equal(
    titlesAreDuplicates("NVIDIA posts record revenue", "TechCrunch", "AMD posts record revenue", "TechCrunch"),
    false,
    "the subject is the story — nvidia vs amd must not meet"
  );
});

test("titlesAreDuplicates drops a lab name only when it occurs in both titles (round-2 defects A + B)", () => {
  // Defect A: each company filing its own revenue — the lab name is the
  // distinguishing subject, so it is kept on both sides and the two
  // revenue stories stay separate rows.
  assert.equal(
    titlesAreDuplicates("NVIDIA posts record revenue", "NVIDIA", "AMD posts record revenue", "AMD"),
    false,
    "own-lab revenue filings must not merge — nvidia vs amd is the story"
  );
  assert.equal(
    titlesAreDuplicates("Google posts record revenue", "Google", "Microsoft posts record revenue", "Microsoft"),
    false,
    "same shape, different companies"
  );
  // Defect B: the identical short launch title filed by the lab and by a
  // press desk — the lab name occurs in both titles, so it drops from
  // both sides and the pair still merges.
  assert.equal(
    titlesAreDuplicates("OpenAI launches GPT-6", "OpenAI", "OpenAI launches GPT-6", "TechCrunch"),
    true,
    "the same headline is the same story, whoever filed it"
  );
  assert.equal(
    titlesAreDuplicates("NVIDIA launches Blackwell", "NVIDIA", "NVIDIA launches Blackwell", "The Verge"),
    true,
    "same headline, lab vs press desk"
  );
  assert.equal(
    titlesAreDuplicates("Google launches Gemini", "Google", "Google launches Gemini", "TechCrunch"),
    true,
    "same headline, lab vs press desk"
  );
});

test("titleSimilarity exposes why a pair did or did not match", () => {
  const dup = titleSimilarity("Jensen Huang steps down as NVIDIA CEO", "NVIDIA", "Jensen Huang resigns as CEO of NVIDIA", "TechCrunch");
  assert.equal(dup.duplicate, true);
  assert.equal(dup.sharedBigram, true, "the shared 'jensen huang' bigram is what catches it");
  assert.equal(dup.digitConflict, false);
  assert.equal(dup.outcomeConflict, false, "both sides leave, so no outcome veto");
  assert.equal(dup.tierConflict, false);
  const versions = titleSimilarity("vLLM v0.34.3", "vLLM", "vLLM v0.34.4", "vLLM");
  assert.equal(versions.duplicate, false);
  assert.equal(versions.digitConflict, true, "the differing version token vetoes the match");
  // Opus vs Sonnet is separated by low Jaccard, NOT by the digit guard:
  // both titles carry the same digit token {5}.
  const models = titleSimilarity("Anthropic releases Claude Opus 5", "Anthropic", "Anthropic releases Claude Sonnet 5", "Anthropic");
  assert.equal(models.duplicate, false);
  assert.equal(models.digitConflict, false, "both carry {5}, so the digit guard does not fire");
  assert.ok(models.jaccard < 0.67, "low Jaccard is what separates them");
});

test("titlesAreDuplicates needs shared substance, not just a shared name", () => {
  // Two same-day pieces that only share the name "Jensen Huang" are two
  // rows, not one story: different theses, two shared tokens, low Jaccard.
  assert.equal(
    titlesAreDuplicates(
      "Jensen Huang and the End of the Founder Fairy Tale",
      "WIRED",
      "What’s really at stake in the Jensen Huang saga",
      "The Verge"
    ),
    false,
    "same person, different pieces — the shared bigram alone must not merge them"
  );
  // A resignation and a chip launch about the same person on the same day
  // are two stories, even though the titles share the name bigram.
  assert.equal(
    titlesAreDuplicates("Jensen Huang resigns as NVIDIA CEO", "TechCrunch", "Jensen Huang unveils a new AI chip", "The Verge"),
    false,
    "same person, different events"
  );
  // The PR description's exact example: "resigns" is an outcome verb now,
  // so it stays in the tokens and the pair no longer meets the bar.
  assert.equal(
    titlesAreDuplicates("Jensen Huang resigns", "TechCrunch", "Jensen Huang unveils a new chip", "The Verge"),
    false,
    "the short resignation title must not merge with the chip launch"
  );
});

test("titlesAreDuplicates vetoes opposite outcomes, however similar the title", () => {
  // Stay vs leave: three shared tokens and a shared bigram would merge
  // these without the outcome guard.
  assert.equal(
    titlesAreDuplicates("Jensen Huang stays as CEO of NVIDIA", "NVIDIA", "Jensen Huang resigns as CEO of NVIDIA", "TechCrunch"),
    false,
    "stays vs resigns are opposite outcomes, not two filings of one"
  );
  // One-sided delay: the delayed announcement and the announcement would
  // merge on three shared tokens without the guard.
  assert.equal(
    titlesAreDuplicates("Jensen Huang delays the NVIDIA CEO announcement", "NVIDIA", "Jensen Huang announces the NVIDIA CEO", "TechCrunch"),
    false,
    "a delayed announcement is not the announcement"
  );
  // One-sided negation: "does not resign" vs "resigns" share four tokens.
  assert.equal(
    titlesAreDuplicates("Jensen Huang does not resign as CEO of NVIDIA", "TechCrunch", "Jensen Huang resigns as CEO of NVIDIA", "NVIDIA"),
    false,
    "a negation on one side only vetoes the merge"
  );
  // Both sides leaving is the same story — the guard only fires on a
  // conflict, not on the presence of a leave word.
  assert.equal(
    titlesAreDuplicates("Jensen Huang steps down as NVIDIA CEO", "NVIDIA", "Jensen Huang resigns as CEO of NVIDIA", "TechCrunch"),
    true,
    "steps down vs resigns is the same resignation"
  );
});

test("titlesAreDuplicates vetoes noun-form outcomes too (round-2 defect C)", () => {
  // The reviewer's exact cases: without the noun forms in the outcome
  // sets these merge on Jaccard 2/3 with outcomeConflict false.
  assert.equal(
    titlesAreDuplicates("Jensen Huang’s resignation as CEO of NVIDIA", "The Verge", "Jensen Huang stays as CEO of NVIDIA", "WIRED"),
    false,
    "resignation vs stays are opposite outcomes"
  );
  assert.equal(
    titlesAreDuplicates("The departure of Jensen Huang as NVIDIA CEO", "TechCrunch", "Jensen Huang stays as NVIDIA CEO", "WIRED"),
    false,
    "departure vs stays are opposite outcomes"
  );
  assert.equal(
    titlesAreDuplicates("The resignation of Jensen Huang as NVIDIA CEO", "TechCrunch", "Jensen Huang remains NVIDIA CEO", "WIRED"),
    false,
    "resignation vs remains are opposite outcomes"
  );
  // One-sided cancellation / postponement against the event itself: both
  // pairs would merge on the bigram branch without the guard.
  assert.equal(
    titlesAreDuplicates("The cancellation of the GPT-6 launch event", "TechCrunch", "OpenAI launches GPT-6 at the event", "OpenAI"),
    false,
    "a cancelled launch is not the launch"
  );
  assert.equal(
    titlesAreDuplicates("The postponement of the GPT-6 launch event", "TechCrunch", "OpenAI launches GPT-6 at the event", "OpenAI"),
    false,
    "a postponed launch is not the launch"
  );
  // The veto is on the outcome, not the word shape: the guard fires and
  // says why.
  const sim = titleSimilarity("Jensen Huang’s resignation as CEO of NVIDIA", "The Verge", "Jensen Huang stays as CEO of NVIDIA", "WIRED");
  assert.equal(sim.outcomeConflict, true, "the noun form trips the outcome guard");
  assert.equal(sim.duplicate, false);
});

test("titlesAreDuplicates does not treat a ranking as a negation", () => {
  // "No. 1" is a ranking, not a negation: it must not veto a match.
  const sim = titleSimilarity("No. 1 AI model GPT-6 launches", "TechCrunch", "GPT-6 launches", "OpenAI");
  assert.equal(sim.outcomeConflict, false, "'No. 1' is not a negation");
  // A real negation still vetoes (same shape as the pinned test above).
  assert.equal(
    titlesAreDuplicates("Jensen Huang does not resign as CEO of NVIDIA", "TechCrunch", "Jensen Huang resigns as CEO of NVIDIA", "NVIDIA"),
    false,
    "'does not resign' still vetoes"
  );
});

test("titlesAreDuplicates vetoes contraction negations too (round-3 defect D)", () => {
  // \bn't\b can never match inside a contraction (no word boundary between
  // "s" and "n" in "doesn't"), so the old regex let every contraction
  // negation merge with its opposite. Both apostrophe forms are pinned:
  // feeds carry the typographic ’ (U+2019) as often as the straight '.
  assert.equal(
    titlesAreDuplicates("Jensen Huang doesn’t resign as CEO of NVIDIA", "The Verge", "Jensen Huang resigns as CEO of NVIDIA", "TechCrunch"),
    false,
    "curly doesn't resign vs resigns are opposite outcomes"
  );
  assert.equal(
    titlesAreDuplicates("Jensen Huang doesn't resign as CEO of NVIDIA", "The Verge", "Jensen Huang resigns as CEO of NVIDIA", "TechCrunch"),
    false,
    "straight doesn't resign vs resigns are opposite outcomes"
  );
  assert.equal(
    titlesAreDuplicates("Jensen Huang won’t stay as NVIDIA CEO", "The Verge", "Jensen Huang stays as NVIDIA CEO", "TechCrunch"),
    false,
    "won't stay vs stays are opposite outcomes"
  );
  assert.equal(
    titlesAreDuplicates("OpenAI can’t launch GPT-6 today", "The Verge", "OpenAI launches GPT-6 today", "TechCrunch"),
    false,
    "can't launch vs launches are opposite outcomes"
  );
  assert.equal(
    titlesAreDuplicates("Jensen Huang cannot stay as NVIDIA CEO", "The Verge", "Jensen Huang stays as NVIDIA CEO", "TechCrunch"),
    false,
    "cannot stay vs stays are opposite outcomes"
  );
  // The guard fires and says why.
  const sim = titleSimilarity("Jensen Huang doesn’t resign as CEO of NVIDIA", "The Verge", "Jensen Huang resigns as CEO of NVIDIA", "TechCrunch");
  assert.equal(sim.outcomeConflict, true, "the contraction trips the outcome guard");
  assert.equal(sim.duplicate, false);
  // Control: "No. 1" is still a ranking, not a negation.
  const rank = titleSimilarity("No. 1 AI model GPT-6 launches", "TechCrunch", "GPT-6 launches", "OpenAI");
  assert.equal(rank.outcomeConflict, false, "'No. 1' still does not veto");
});

test("titlesAreDuplicates vetoes differing tiers", () => {
  // The PR's own must-not-cluster example: without the tier veto this
  // merges on the bigram branch (Jaccard 2/3 >= 0.6).
  assert.equal(
    titlesAreDuplicates("iPhone 17", "Apple", "iPhone 17 Pro", "Apple"),
    false,
    "a base model and its Pro tier are different products"
  );
  assert.equal(
    titlesAreDuplicates("iPhone 17 Pro", "Apple", "iPhone 17 Pro Max", "Apple"),
    false,
    "two different tiers are different products"
  );
  assert.equal(
    titlesAreDuplicates("MacBook Air", "Apple", "MacBook Air M5", "Apple"),
    true,
    "the same tier on both sides is no veto"
  );
});

test("titlesAreDuplicates clusters a short announcement against long descriptive filings", () => {
  // Real 2026-11-13 filings: the two press titles share 5 tokens.
  assert.equal(
    titlesAreDuplicates(
      "ChatGPT Wallet lets OpenAI’s Dots agents make purchases for you",
      "The Verge",
      "ChatGPT’s new Wallet lets AI agents shop and check out for you",
      "TechCrunch"
    ),
    true,
    "two long filings of the same launch share 5 tokens"
  );
  // But the 2-token short title no longer merges into a long filing on the
  // subset shortcut alone: its whole overlap is the bigram, so the
  // substance floor beyond the bigram is 0.
  assert.equal(
    titlesAreDuplicates("Introducing ChatGPT Wallet", "OpenAI", "ChatGPT’s new Wallet lets AI agents shop and check out for you", "TechCrunch"),
    false,
    "a 2-token subset of a long filing is not enough substance"
  );
});

test("titlesAreDuplicates boundary: Jaccard exactly two thirds is below the bar", () => {
  // Word-order shuffle, no shared bigram: Jaccard 2/3, subset, but the
  // subset gate needs 3 shared tokens beyond the bigram — here there is no
  // shared bigram at all, so the floor is 2. Pins that 2/3 < 0.67.
  const sim = titleSimilarity("Gemini 4", "Google", "Gemini Hydrogen 4", "Google");
  assert.equal(sim.jaccard, 2 / 3);
  assert.equal(sim.sharedBigram, false);
  assert.equal(sim.duplicate, false);
});

test("titlesAreDuplicates boundary: a one-sided digit does not veto", () => {
  // "Opus 5" vs bare "Opus": the unversioned title carries no conflicting
  // version, so the digit guard does not fire and the pair clusters on the
  // bigram branch.
  const sim = titleSimilarity("Anthropic releases Claude Opus 5", "Anthropic", "Anthropic releases Claude Opus", "Anthropic");
  assert.equal(sim.digitConflict, false);
  assert.equal(sim.duplicate, true);
});

test("clusterBriefs files the second filing under the earliest within 48h", () => {
  const briefs = [
    { headline: "Jensen Huang resigns as CEO of NVIDIA", lab: "TechCrunch", publishedAt: "2026-11-14T10:00:00Z", path: "/b/2026/11/14/jensen-huang-resigns/" },
    { headline: "Jensen Huang steps down as NVIDIA CEO", lab: "NVIDIA", publishedAt: "2026-11-13T09:00:00Z", path: "/b/2026/11/13/jensen-huang-steps-down/" },
    { headline: "OpenAI launches GPT-6", lab: "OpenAI", publishedAt: "2026-11-14T09:00:00Z", path: "/b/2026/11/14/openai-launches-gpt-6/" },
  ];
  const clusters = clusterBriefs(briefs);
  assert.equal(clusters.length, 2, "three briefs, two stories");
  // Newest primary first: the GPT-6 cluster leads, the Huang cluster follows.
  assert.equal(clusters[0].primary.lab, "OpenAI");
  assert.equal(clusters[0].also.length, 0);
  // The primary is the EARLIEST filing, not the newest: the row's headline,
  // lab and kind stay put when a newer filing arrives.
  assert.equal(clusters[1].primary.lab, "NVIDIA", "the primary is the earliest filing");
  assert.equal(clusters[1].also.length, 1, "the TechCrunch filing joins it");
  assert.equal(clusters[1].also[0].lab, "TechCrunch");
});

test("clusterBriefs does not cluster the same story more than 48h apart", () => {
  const briefs = [
    { headline: "Introducing Gemini 4 Hydrogen", lab: "Google", publishedAt: "2026-11-14T10:00:00Z", path: "/b/2026/11/14/gemini-4-hydrogen/" },
    { headline: "Google launches Gemini 4 Hydrogen", lab: "The Verge", publishedAt: "2026-11-11T09:00:00Z", path: "/b/2026/11/11/gemini-4-hydrogen-verge/" },
  ];
  const clusters = clusterBriefs(briefs);
  assert.equal(clusters.length, 2, "73 hours apart is a new filing, not a duplicate");
  assert.equal(clusters[0].also.length, 0);
  assert.equal(clusters[1].also.length, 0);
});

test("clusterBriefs boundary: exactly 48h joins, 48h and one second does not", () => {
  const a = { headline: "Jensen Huang resigns as CEO of NVIDIA", lab: "TechCrunch", publishedAt: "2026-11-13T00:00:00Z", path: "/b/a/" };
  const at48h = { headline: "Jensen Huang steps down as NVIDIA CEO", lab: "NVIDIA", publishedAt: "2026-11-15T00:00:00Z", path: "/b/b/" };
  const past48h = { headline: "Jensen Huang steps down as NVIDIA CEO", lab: "NVIDIA", publishedAt: "2026-11-15T00:00:01Z", path: "/b/b/" };
  assert.equal(clusterBriefs([a, at48h]).length, 1, "exactly 48h is inside the window");
  assert.equal(clusterBriefs([a, past48h]).length, 2, "48h and one second is outside it");
});

test("clusterBriefs never chains past the primary's window", () => {
  // A (day 0), B (day 1, joins A), C (day 2 + 1s): C duplicates B, but the
  // window is measured from the primary A, never through B, so C starts a
  // new cluster instead of chaining the story into a third day.
  const briefs = [
    { headline: "Jensen Huang resigns as CEO of NVIDIA", lab: "TechCrunch", publishedAt: "2026-11-13T00:00:00Z", path: "/b/a/" },
    { headline: "Jensen Huang resigns as CEO of NVIDIA", lab: "The Verge", publishedAt: "2026-11-14T00:00:00Z", path: "/b/b/" },
    { headline: "Jensen Huang resigns as CEO of NVIDIA", lab: "WIRED", publishedAt: "2026-11-15T00:00:01Z", path: "/b/c/" },
  ];
  const clusters = clusterBriefs(briefs);
  assert.equal(clusters.length, 2, "three filings, two clusters — no chaining");
  assert.equal(clusters[0].primary.lab, "WIRED", "the late filing is its own cluster");
  assert.equal(clusters[0].also.length, 0);
  assert.equal(clusters[1].primary.lab, "TechCrunch", "the earliest filing stays primary");
  assert.equal(clusters[1].also.length, 1);
  assert.equal(clusters[1].also[0].lab, "The Verge");
});

test("clusterBriefs gives the same clusters whatever order the briefs arrive in", () => {
  const a = { headline: "Jensen Huang resigns as CEO of NVIDIA", lab: "TechCrunch", publishedAt: "2026-11-14T10:00:00Z", path: "/b/a/" };
  const b = { headline: "Jensen Huang steps down as NVIDIA CEO", lab: "NVIDIA", publishedAt: "2026-11-13T09:00:00Z", path: "/b/b/" };
  const c = { headline: "OpenAI launches GPT-6", lab: "OpenAI", publishedAt: "2026-11-14T09:00:00Z", path: "/b/c/" };
  const shape = (clusters) =>
    clusters.map((cl) => [cl.primary.lab, ...cl.also.map((x) => x.lab)].join("+")).sort();
  const expected = ["NVIDIA+TechCrunch", "OpenAI"];
  assert.deepEqual(shape(clusterBriefs([a, b, c])), expected, "newest-first");
  assert.deepEqual(shape(clusterBriefs([c, b, a])), expected, "oldest-first");
  assert.deepEqual(shape(clusterBriefs([b, c, a])), expected, "shuffled");
});

test("clusterBriefs never drops a brief: every input is a primary or an also", () => {
  const briefs = [
    { headline: "Introducing ChatGPT Wallet", lab: "OpenAI", publishedAt: "2026-11-14T10:00:00Z", path: "/b/1/" },
    { headline: "OpenAI launches ChatGPT Wallet", lab: "TechCrunch", publishedAt: "2026-11-14T09:00:00Z", path: "/b/2/" },
    { headline: "Introducing ChatGPT Wallet", lab: "The Verge", publishedAt: "2026-11-14T08:00:00Z", path: "/b/3/" },
  ];
  const clusters = clusterBriefs(briefs);
  assert.equal(clusters.length, 1, "three filings, one story");
  // The primary is the earliest filing (The Verge, 08:00); the other two
  // join it in chronological order.
  assert.equal(clusters[0].primary.lab, "The Verge");
  assert.equal(clusters[0].also.length, 2);
  assert.equal(clusters[0].also[0].lab, "TechCrunch");
  assert.equal(clusters[0].also[1].lab, "OpenAI");
  const accounted = clusters.flatMap((c) => [c.primary, ...c.also]);
  assert.equal(accounted.length, briefs.length);
});

test("boardPrimaries clones the primary: the brief itself is never mutated", () => {
  const briefs = [
    { guid: "g-tc", headline: "Jensen Huang resigns as CEO of NVIDIA", lab: "TechCrunch", labId: "techcrunch", publishedAt: "2026-11-14T10:00:00Z", path: "/b/a/", dateLabel: "2026-11-14" },
    { guid: "g-nv", headline: "Jensen Huang steps down as NVIDIA CEO", lab: "NVIDIA", labId: "nvidia", publishedAt: "2026-11-13T09:00:00Z", path: "/b/b/", dateLabel: "2026-11-13" },
  ];
  const clusters = clusterBriefs(briefs);
  const rows = boardPrimaries(clusters);
  assert.equal(rows.length, 1);
  // The board row carries the annotation…
  assert.equal(rows[0].alsoFiled.length, 1);
  assert.equal(rows[0].alsoFiled[0].guid, "g-tc");
  assert.equal(rows[0].alsoFiled[0].lab, "TechCrunch");
  assert.equal(rows[0].alsoFiled[0].headline, "Jensen Huang resigns as CEO of NVIDIA");
  assert.equal(rows[0].alsoFiled[0].dateLabel, "2026-11-14");
  // …while the brief the cluster was built from stays clean, so /week/
  // and /lab/ never show the annotation and the archive never persists it.
  assert.equal("alsoFiled" in clusters[0].primary, false);
  assert.equal("alsoFiled" in briefs[1], false);
});

test("selectBoard leads with today, then backfills the most recent earlier rows", () => {
  // Primaries arrive newest-first, as clusterBriefs returns them.
  const rows = [
    { dateLabel: "2026-11-14", headline: "today" },
    { dateLabel: "2026-11-13", headline: "yesterday" },
    { dateLabel: "2026-11-12", headline: "old" },
  ];
  const board = selectBoard(rows, "2026-11-14", 2);
  assert.deepEqual(board.map((b) => b.headline), ["today", "yesterday"]);
});

test("queueFromBoard suppresses a story already posted under an earlier primary", () => {
  const rows = [
    { guid: "g-new", headline: "new story", alsoFiled: [] },
    {
      guid: "g-late",
      headline: "late older filing",
      alsoFiled: [{ guid: "g-posted", lab: "TechCrunch", headline: "same story", dateLabel: "2026-11-13" }],
    },
    {
      guid: "g-other",
      headline: "another story",
      alsoFiled: [{ guid: "g-unposted", lab: "The Verge", headline: "same story", dateLabel: "2026-11-13" }],
    },
  ];
  const queue = queueFromBoard(rows, { "g-posted": "https://t.me/labledgerdesk/1" });
  assert.deepEqual(queue.map((b) => b.guid), ["g-new", "g-other"]);
});

test("alsoFiledLine names lab, headline and date, and is empty without filings", () => {
  assert.equal(alsoFiledLine(), "");
  assert.equal(alsoFiledLine([]), "");
  assert.equal(
    alsoFiledLine([
      { lab: "TechCrunch", headline: "ChatGPT Wallet lets agents shop", dateLabel: "2026-11-13" },
      { lab: "OpenAI", headline: "Introducing ChatGPT Wallet", dateLabel: "2026-11-13" },
    ]),
    "Also filed by TechCrunch: ChatGPT Wallet lets agents shop (2026-11-13) · OpenAI: Introducing ChatGPT Wallet (2026-11-13)"
  );
});

test("build-desk writes the archive before clustering, so alsoFiled is never persisted", async () => {
  // A source-order pin for the invariant: the archive write must come
  // first in the file, and clustering must run after it.
  const { readFile } = await import("node:fs/promises");
  const src = await readFile(new URL("../scripts/build-desk.mjs", import.meta.url), "utf8");
  const archiveWrite = src.indexOf("writeFile(\n  ARCHIVE_FILE,");
  const clusterCall = src.indexOf("clusterBriefs(allBriefs)");
  assert.ok(archiveWrite > -1, "the archive write exists");
  assert.ok(clusterCall > -1, "the clusterBriefs call exists");
  assert.ok(archiveWrite < clusterCall, "the archive is written before clusterBriefs runs");
});
