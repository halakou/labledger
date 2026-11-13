import { AMP, KINDS, LABS, TOPICS } from "./config.mjs";
export {
  AMP,
  ARCHIVE_FILE,
  ARCHIVE_MAX,
  ASSET_DIR,
  CHANNEL,
  FONT_DIR,
  FONT_UA,
  KINDS,
  LABS,
  LAB_BY_ID,
  MARK_DIR,
  MARK_MAX,
  MAX_BRIEFS,
  OG_CANDIDATES,
  OUT,
  PER_FEED,
  POSTED_FILE,
  QUEUE_FILE,
  RECENT_MS,
  SITE,
  TOPICS,
  UA,
  runLog,
} from "./config.mjs";

export function esc(s) {
  return String(s)
    .replace(/&/g, AMP + "amp;")
    .replace(/</g, AMP + "lt;")
    .replace(/>/g, AMP + "gt;")
    .replace(/"/g, AMP + "quot;");
}

export function decodeOnce(text) {
  return text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(new RegExp(AMP + "amp;", "g"), "&")
    .replace(new RegExp(AMP + "lt;", "g"), "<")
    .replace(new RegExp(AMP + "gt;", "g"), ">")
    .replace(new RegExp(AMP + "quot;", "g"), '"')
    .replace(new RegExp(AMP + "#39;", "g"), "'")
    .replace(new RegExp(AMP + "apos;", "g"), "'")
    .replace(/&#(\d+);/g, (_, n) => {
      const code = Number(n);
      return code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : "";
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => {
      const code = parseInt(n, 16);
      return code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : "";
    });
}

export function decode(text) {
  let cur = text;
  for (let i = 0; i < 3; i += 1) {
    const next = decodeOnce(cur);
    if (next === cur) break;
    cur = next;
  }
  return cur.trim();
}

// GitHub release notes are the squash-commit message, so the feed's <content>
// is often *nothing but* a trailer block: "Signed-off-by: Robert Shaw <…>
// <br>Co-authored-by: Bob <…> (cherry picked from commit abc123)". Cutting at
// the first trailer would return an empty string in that case, and an empty
// summary is a worse brief than none (the fallback path invents a sentence).
// So: drop trailer *runs* wherever they appear, and keep whatever prose is
// left, even when that is nothing.
const TRAILER_KEYS = "signed-off-by|co-?authored-by|reviewed-by|acked-by|reported-by|tested-by|suggested-by|helped-by|cherry picked from commit";
// A trailer begins at the start of a line, after a sentence ends, or right
// after a tag boundary — GitHub renders trailers as <br>-separated HTML.
const TRAILER_START = new RegExp("(?:^|\\n|\\.\\s*|>\\s*)(?:" + TRAILER_KEYS + ")[\\s:]", "i");
export function stripCommitTrailers(text) {
  const t = String(text || "");
  const at = t.search(TRAILER_START);
  if (at < 0) return t;
  // Everything from the first trailer on is provenance — the squash-commit
  // footer, never a summary of the release. Dropping it whole is the right
  // call even when prose follows it, because that prose is part of the same
  // commit message rather than a description of the release. An empty result
  // is fine: presentRelease then writes a sentence naming the lab, the version
  // and the feed, which reads better than provenance.
  return t.slice(0, at).trim();
}

export function strip(text) {
  // C7 (CodeQL js/bad-tag-filter): the classic bypasses are a nested tag —
  // "<scr<script>ipt>" collapsing back into "<script>" — and a malformed close
  // like "</script foo=\"bar\">", which a strict "</script>" match misses but a
  // browser still accepts. CodeQL flags a literal that names a tag and removes
  // it, and its recommendation is a parser library, which this repo cannot take
  // (zero dependencies is an invariant).
  //
  // The compromise that keeps both properties: name the tag, but close the
  // bypass CodeQL actually describes by matching the close generically, so a
  // malformed "</script foo=...>" is still consumed, and loop the whole pass
  // so a nested tag's inner removal is caught on the next iteration. Only the
  // script/style families drop their bodies, because those are the only
  // element types whose body is code rather than prose; everything else keeps
  // its text and loses only the tags.
  let out = decode(text);
  for (let i = 0; i < 8; i += 1) {
    const next = out
      .replace(/<script\b[^<>]*>[\s\S]*?<\/[^<>]*>/gi, " ")
      .replace(/<style\b[^<>]*>[\s\S]*?<\/[^<>]*>/gi, " ")
      .replace(/<[^<>]*>/g, " ")
      .replace(/<[^<>]*$/, " ")
      .replace(/--!>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (next === out) break;
    out = next;
  }
  return out;
}

export function tag(chunk, name) {
  const cdata = chunk.match(new RegExp("<" + name + "[^>]*>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*</" + name + ">", "i"));
  if (cdata?.[1]) return decode(cdata[1]);
  const normal = chunk.match(new RegExp("<" + name + "[^>]*>([\\s\\S]*?)</" + name + ">", "i"));
  return normal?.[1] ? decode(normal[1]) : "";
}

export function href(chunk) {
  const atom = chunk.match(/<link[^>]+href=["']([^"']+)["'][^>]*\/?>/i);
  if (atom?.[1]) return decode(atom[1]);
  return tag(chunk, "link");
}

export function published(chunk) {
  const raw = tag(chunk, "pubDate") || tag(chunk, "published") || tag(chunk, "updated") || tag(chunk, "dc:date");
  const date = raw ? new Date(raw) : new Date();
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

export function parseFeed(xml) {
  const blocks = [...xml.split(/<item[\s>]/i).slice(1), ...xml.split(/<entry[\s>]/i).slice(1)];
  const items = [];
  for (const block of blocks) {
    const endItem = block.search(/<\/item>/i);
    const endEntry = block.search(/<\/entry>/i);
    const end = endItem >= 0 ? endItem : endEntry;
    const chunk = end >= 0 ? block.slice(0, end) : block;
    const title = strip(tag(chunk, "title"));
    let link = href(chunk).split("?")[0];
    if (link.startsWith("http://")) link = "https://" + link.slice(7);
    if (!title || !link.startsWith("https://")) continue;
    const raw = strip(tag(chunk, "description") || tag(chunk, "summary") || tag(chunk, "content") || tag(chunk, "content:encoded"));
    const summary = stripCommitTrailers(raw).slice(0, 2500);
    items.push({
      title: title.slice(0, 220),
      link,
      guid: strip(tag(chunk, "guid") || tag(chunk, "id") || link),
      publishedAt: published(chunk),
      summary,
    });
  }
  return items;
}

export function hostOf(url) {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return null;
    return u.hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

export function hostAllowed(url, hosts) {
  const h = hostOf(url);
  return Boolean(h && hosts.includes(h));
}

export function slugify(title) {
  // Truncate at a word boundary, not mid-word: the slug is the URL, so a
  // hyphen dangling from a half-word ("comfyui-v0-38-1-relea-") reads as a
  // different page than the one a reader pastes back. Trim to the limit
  // first, then cut at the last space inside it, then strip the punctuation
  // a partial word would leave behind.
  const base = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  if (base.length <= 72) return base || "brief";
  const cut = base.slice(0, 72);
  const sp = cut.lastIndexOf("-");
  const trimmed = sp > 24 ? cut.slice(0, sp) : cut;
  return trimmed.replace(/-+$/, "") || "brief";
}
export function pad(n) {
  return String(n).padStart(2, "0");
}
export function ymd(date) {
  return { year: String(date.getUTCFullYear()), month: pad(date.getUTCMonth() + 1), day: pad(date.getUTCDate()) };
}

export function clip(text, max) {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  const sp = cut.lastIndexOf(" ");
  return (sp > 40 ? cut.slice(0, sp) : cut).replace(/[,:;\u2013-]+$/, "") + "\u2026";
}

export function clipSentence(text, max) {
  const t = String(text || "").replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const parts = t.split(/(?<=[.!?])\s+/);
  let out = "";
  for (const s of parts) {
    const candidate = out ? out + " " + s : s;
    if (candidate.length > max) break;
    out = candidate;
  }
  if (!out) {
    const s = parts[0] || t;
    if (s.length <= max) return s;
    const cut = s.slice(0, max - 1);
    const sp = cut.lastIndexOf(" ");
    return (sp > 40 ? cut.slice(0, sp) : cut).replace(/[,:;\u2013-]+$/, "") + "\u2026";
  }
  return out.length < t.length ? out + " …" : out;
}

export function wordCount(text) {
  return String(text).trim().split(/\s+/).filter(Boolean).length;
}

export function clipWords(text, max) {
  const words = String(text).replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  if (words.length <= max) return words.join(" ");
  const acc = [];
  for (const w of words) {
    acc.push(w);
    if (acc.length >= max - 8 && /[.!?]"?$/.test(w)) break;
    if (acc.length >= max) break;
  }
  let out = acc.join(" ");
  if (!/[.!?]$/.test(out)) out = out.replace(/[,:;\u2013\u2014-]+$/, "") + ".";
  return out;
}

export function hay(text) {
  return " " + String(text).toLowerCase().replace(/[^a-z0-9+]+/g, " ").trim() + " ";
}
export function hasAny(h, words) {
  return words.some((w) => h.includes(" " + w + " "));
}

export function classifyKind(title, summary) {
  const ht = hay(title);
  const hs = hay(title + " " + summary);
  const launchWords = [
    "introducing", "introduces", "introduce", "launches", "launched", "launch",
    "now available", "generally available", "general availability", "available today",
    "release", "released", "shipping", "announces", "announced", "announcing",
  ];
  const researchWords = ["arxiv", "preprint", "benchmark", "dataset", "paper", "findings", "we present", "technical report", "ablation"];
  if (hasAny(ht, launchWords)) return "launch";
  if (hasAny(ht, researchWords) || hasAny(ht, ["research", "study"])) return "research";
  if (hasAny(hs, launchWords)) return "launch";
  if (hasAny(hs, researchWords)) return "research";
  if (hasAny(hs, ["research", "study"]) && !hasAny(hs, ["research company", "research preview"])) return "research";
  return "note";
}

export function classifyTopics(title, summary) {
  const h = hay(title + " " + summary);
  const found = [];
  const rules = [
    ["llm", ["llm", "llms", "language model", "language models", "gpt", "chatgpt", "claude", "gemini", "llama", "mistral", "kimi", "tokens", "tokenizer", "foundation model"]],
    ["hardware", ["gpu", "gpus", "cuda", "chip", "chips", "silicon", "nvidia", "blackwell", "h100", "h200", "tpu", "mlx", "accelerator"]],
    ["medical", ["medical", "clinical", "clinic", "hospital", "patient", "patients", "diagnosis", "genomic", "genome", "dna", "surgery", "cancer", "drug", "disease", "health care", "healthcare"]],
    ["safety", ["safety", "alignment", "watermark", "watermarking", "red team", "responsible", "misuse", "biosecurity", "child safety"]],
    ["open", ["open source", "open-source", "open weights", "open weight", "apache", "hugging face", "huggingface"]],
    ["agents", ["agent", "agents", "tool use", "computer use", "autonomous"]],
    ["science", ["weather", "climate", "materials", "protein", "biology", "physics", "discovery", "genomics", "earth"]],
    ["enterprise", ["enterprise", "bedrock", "sagemaker", "azure", "partner", "partnership", "sovereign"]],
  ];
  for (const [id, words] of rules) {
    if (hasAny(h, words)) found.push(id);
    if (found.length >= 2) break;
  }
  return found;
}

// P0-1: duplicate-story clustering, no AI.
//
// The desk files the same story from several labs (a launch covered by the
// lab itself, a press desk and a wire the same day). A second board row for
// the same story is noise, not news — but the second filing must not be
// deleted either: it keeps its archive entry and its /b/ page, and the
// primary row links to it as "also filed by …".
//
// The similarity is pure Node, no embeddings, no model:
//   1. normalise the title — lowercase, drop the source name (any LABS label
//      word: "OpenAI launches …" and "Introducing …" from OpenAI must meet),
//      drop stopwords and generic framing verbs, light-stem what is left;
//   2. keyword overlap — Jaccard over the stemmed token sets, plus a shared
//      bigram (two adjacent content tokens in the same order), which is what
//      catches "Jensen Huang steps down" vs "Jensen Huang resigns";
//   3. a digit guard — tokens carrying a digit (versions, model numbers,
//      chip names) must not conflict: "v0.34.3" vs "v0.34.4" and
//      "Claude Opus 5" vs "Claude Opus 5.1" are different releases, however
//      similar the rest of the title looks.
//
// A shared bigram alone is not enough: two different pieces about the same
// person ("Jensen Huang resigns" vs "Jensen Huang unveils a new chip", or
// two same-day opinion pieces that only share the name "Jensen Huang")
// would merge on that bigram. So a bigram match also needs real shared
// substance — at least 3 shared tokens, or Jaccard >= 0.6, or one title's
// tokens being a subset of the other's (a short announcement title against
// a long descriptive one, e.g. "Introducing ChatGPT Wallet" vs the
// TechCrunch/Verge wallet stories). A bare high Jaccard (>= 0.67) clusters
// on its own, which covers word-order shuffles with no shared bigram.
//
// Known limit, stated honestly: this cannot tell "Gemini 4" vs
// "Gemini 4 Hydrogen" (same launch, filed under two titles — cluster) from
// "iPhone 17" vs "iPhone 17 Pro" (two tiers — must not cluster). The
// mitigation is that clustering only ever hides a board row: the duplicate
// keeps its own /b/ page, linked from the primary row, so a reader is one
// click away from it. If that trade-off ever proves wrong, the fix is a
// stricter threshold or an explicit block-list, not a model.
export const CLUSTER_WINDOW_MS = 48 * 60 * 60 * 1000;
const CLUSTER_JACCARD_MIN = 0.67;
const CLUSTER_BIGRAM_JACCARD_MIN = 0.6;
const CLUSTER_BIGRAM_SHARED_MIN = 3;

const CLUSTER_STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "of", "to", "for", "with", "on", "in", "at",
  "by", "from", "as", "is", "are", "was", "were", "its", "it", "this", "that",
  "these", "those", "be", "been", "has", "have", "had", "will", "would",
  "can", "could", "not", "no", "vs", "per", "via",
]);

// Framing verbs, as stems (see stemToken): the word a desk uses to announce
// something, not the thing itself. "Introducing X" and "X launches" are the
// same filing. Directional or outcome verbs (fall/rise/win/lose) are NOT
// here — "X resigns" vs "X stays" must stay distinguishable.
const CLUSTER_GENERIC_VERBS = new Set([
  "introduc", "launch", "releas", "announc", "unveil", "ship", "debut",
  "present", "publish", "post", "share", "bring", "avail", "resign", "step",
  "leav", "depart", "join", "appoint", "name",
]);

// Temporal filler, as stems.
const CLUSTER_FILLER = new Set(["now", "today", "here", "new", "first", "next", "latest", "just"]);

// Every word of every LABS label, lowercased: the source name, wherever it
// appears in a title. "NVIDIA" is a lab and a subject at once; dropping it
// from both sides is what lets two filings of the same NVIDIA story meet.
const SOURCE_TOKENS = new Set(
  LABS.flatMap((lab) => String(lab.label || "").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)),
);

export function stemToken(token) {
  const t = String(token || "");
  if (/\d/.test(t) || t.length < 4) return t;
  for (const suffix of ["ing", "ed", "es", "s"]) {
    if (t.endsWith(suffix) && t.length - suffix.length >= 3) return t.slice(0, -suffix.length);
  }
  return t;
}

// Ordered, deduplicated content tokens of a title: version/model tokens
// ("v0.34.3", "gpt-5", "4") kept whole, source names, stopwords, framing
// verbs and filler dropped, the rest light-stemmed.
export function titleKeywords(title) {
  const raw = String(title || "").toLowerCase();
  const tokens = raw.match(/(v?\d+(?:\.\d+)+)|([a-z0-9]+(?:-[a-z0-9]+)*)/g) || [];
  const out = [];
  const seen = new Set();
  for (const token of tokens) {
    if (SOURCE_TOKENS.has(token)) continue;
    if (/\d/.test(token)) {
      if (!seen.has(token)) { seen.add(token); out.push(token); }
      continue;
    }
    if (token.length < 2 || CLUSTER_STOPWORDS.has(token)) continue;
    const stem = stemToken(token);
    if (CLUSTER_GENERIC_VERBS.has(stem) || CLUSTER_FILLER.has(stem)) continue;
    if (!seen.has(stem)) { seen.add(stem); out.push(stem); }
  }
  return out;
}

function digitTokens(tokens) {
  return new Set(tokens.filter((t) => /\d/.test(t)));
}

function jaccard(a, b) {
  const setA = new Set(a);
  const setB = new Set(b);
  if (!setA.size && !setB.size) return 0;
  let shared = 0;
  for (const t of setA) if (setB.has(t)) shared += 1;
  return shared / (setA.size + setB.size - shared);
}

function sharedCount(a, b) {
  const setB = new Set(b);
  let shared = 0;
  for (const t of new Set(a)) if (setB.has(t)) shared += 1;
  return shared;
}

function isSubset(a, b) {
  if (!a.length || !b.length) return false;
  const setA = new Set(a);
  const setB = new Set(b);
  return a.every((t) => setB.has(t)) || b.every((t) => setA.has(t));
}

function hasSharedBigram(a, b) {
  if (a.length < 2 || b.length < 2) return false;
  const bigrams = new Set();
  for (let i = 0; i + 1 < b.length; i += 1) bigrams.add(b[i] + " " + b[i + 1]);
  for (let i = 0; i + 1 < a.length; i += 1) {
    if (bigrams.has(a[i] + " " + a[i + 1])) return true;
  }
  return false;
}

// { jaccard, sharedBigram, shared, subset, digitConflict, duplicate } for
// two titles. Digit tokens must agree: if both titles carry digit tokens
// and the sets differ, the filings are different releases, whatever the
// overlap says. Otherwise: a high Jaccard clusters on its own; a shared
// bigram clusters only with real shared substance (see the P0-1 comment
// above), so two different pieces that merely name the same person stay
// separate rows.
export function titleSimilarity(aTitle, bTitle) {
  const ka = titleKeywords(aTitle);
  const kb = titleKeywords(bTitle);
  const da = digitTokens(ka);
  const db = digitTokens(kb);
  const digitConflict =
    da.size > 0 &&
    db.size > 0 &&
    (da.size !== db.size || [...da].some((t) => !db.has(t)));
  const sharedBigram = hasSharedBigram(ka, kb);
  const score = jaccard(ka, kb);
  const shared = sharedCount(ka, kb);
  const subset = isSubset(ka, kb);
  const bigramSubstance =
    sharedBigram && (shared >= CLUSTER_BIGRAM_SHARED_MIN || score >= CLUSTER_BIGRAM_JACCARD_MIN || subset);
  return {
    jaccard: score,
    sharedBigram,
    shared,
    subset,
    digitConflict,
    duplicate: !digitConflict && (score >= CLUSTER_JACCARD_MIN || bigramSubstance),
  };
}

export function titlesAreDuplicates(aTitle, bTitle) {
  return titleSimilarity(aTitle, bTitle).duplicate;
}

// Greedy clustering over briefs sorted newest-first (as build-desk.mjs
// sorts allBriefs). The primary of a cluster is its newest brief; a later
// brief joins the first cluster whose primary it duplicates and which is at
// most CLUSTER_WINDOW_MS newer than it. Because the input is newest-first,
// once a primary is older than the window every later primary is older too,
// so the scan stops there. Returns [{ primary, also: [brief, …] }] in
// newest-primary-first order. Pure: no brief is mutated, nothing is dropped.
export function clusterBriefs(briefs, windowMs = CLUSTER_WINDOW_MS) {
  const clusters = [];
  for (const brief of briefs || []) {
    const at = new Date(brief?.publishedAt).getTime();
    if (Number.isNaN(at)) {
      clusters.push({ primary: brief, also: [] });
      continue;
    }
    let placed = false;
    for (const cluster of clusters) {
      const primaryAt = new Date(cluster.primary?.publishedAt).getTime();
      if (Number.isNaN(primaryAt)) continue;
      if (primaryAt - at > windowMs) break;
      if (titlesAreDuplicates(cluster.primary?.headline || "", brief?.headline || "")) {
        cluster.also.push(brief);
        placed = true;
        break;
      }
    }
    if (!placed) clusters.push({ primary: brief, also: [] });
  }
  return clusters;
}

export function kindLabel(id) {
  return KINDS.find((k) => k.id === id)?.label || "Note";
}
export function topicLabel(id) {
  return TOPICS.find((t) => t.id === id)?.label || id;
}

export function composeWhat(summary, lab, headline, dateLabel) {
  let body = String(summary || "").replace(/\s+/g, " ").trim();
  if (!body) return lab + " published \u201c" + headline + "\u201d on " + dateLabel + ".";
  return clipSentence(body, 320);
}

// C3: the board's "Why it matters" line is not a place for invented analysis.
// The old composeWhy rotated five near-identical restatements of lab/date/kind
// ("Filed as…", "…posted…") which read machine-generated and carried no "why".
// What the desk actually knows from the allow-listed source is (a) the lab,
// (b) the date, (c) the filing kind, and (d) the topics the desk itself
// tagged the brief with. Each of those is stated once, plainly. Nothing is
// inferred, no claim is expanded beyond the source's own words — the
// substantive "what" lives in composeWhy's sibling composeWhat.
export function composeWhy(lab, dateLabel, kind, topics) {
  const label = kind === "launch" ? "a launch filing" : kind === "research" ? "a research filing" : "a public note";
  const topicBit = topics.length ? " The desk tags this brief " + topics.map((t) => topicLabel(t)).join(" / ") + "." : "";
  return "Filed as " + label + " from " + lab + ", " + dateLabel + "." + topicBit;
}

const VERSION_TITLE = /^v?\d+\.\d+[\w.+-]*$/i;

export function presentRelease(label, item) {
  const raw = String(item?.title || "").trim();
  const versionOnly = VERSION_TITLE.test(raw);
  const who = String(label || "The project");
  const headline = (versionOnly ? who + " " + raw : raw).slice(0, 220);
  let summary = String(item?.summary || "").replace(/\s+/g, " ").trim();
  const words = summary ? summary.split(" ").filter(Boolean).length : 0;
  const thinRelease = words < 12;
  if (thinRelease) {
    summary =
      who +
      " published release " +
      (raw || "an untagged build") +
      " on its official releases feed. The feed did not include notes, so this brief is the version and the primary source, nothing more.";
  }
  return {
    ...item,
    title: headline,
    summary: summary.slice(0, 2500),
    thinRelease,
    rawTitle: raw,
  };
}

export function sentences(text) {
  return text.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter((s) => s.length > 24 && s.length < 400);
}

export function factsFor(b) {
  const host = hostOf(b.source) || b.source;
  const method =
    b.via === "listing"
      ? "official HTML listing and article meta"
      : b.via === "github release"
        ? "official GitHub releases feed"
        : "official RSS";
  const lab = String(b.lab || "the source");
  const article = /^the\s/i.test(lab) ? "" : "the ";
  const out = [
    "Filed from " + article + lab + " " + method + " on " + b.dateLabel + ".",
    "Primary source host: " + host + ".",
  ];
  const claim = sentences(b.what)[0];
  if (claim && claim.length < 220 && !out.some((s) => s.includes(claim.slice(0, 36)))) out.push(claim);
  if (out.length < 3) out.push("The desk does not add a second source.");
  return out.slice(0, 3);
}

export function metaContent(html, key) {
  const re1 = new RegExp("<meta[^>]+(?:property|name)=[\"']" + key + "[\"'][^>]*content=[\"']([^\"']+)[\"']", "i");
  const re2 = new RegExp("<meta[^>]+content=[\"']([^\"']+)[\"'][^>]*(?:property|name)=[\"']" + key + "[\"']", "i");
  const m = html.match(re1) || html.match(re2);
  return m?.[1] ? decode(m[1]) : "";
}

export function timeDatetime(html) {
  const m = html.match(/<time[^>]+datetime=["']([^"']+)["']/i);
  if (!m?.[1]) return "";
  const d = new Date(m[1]);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString();
}
