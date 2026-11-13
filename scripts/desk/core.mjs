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
//   1. normalise the title — lowercase, drop the filing lab's OWN name only
//      (\"OpenAI launches …\" filed by OpenAI meets \"Introducing …\" from
//      OpenAI; but \"NVIDIA posts record revenue\" filed by TechCrunch keeps
//      \"nvidia\", so it can never meet \"AMD posts record revenue\"), drop
//      stopwords and generic framing verbs, light-stem what is left;
//   2. keyword overlap — Jaccard over the stemmed token sets, plus a shared
//      bigram (two adjacent content tokens in the same order), which is what
//      catches "Jensen Huang steps down" vs "Jensen Huang resigns";
//   3. vetoes — digit tokens (versions, model numbers) must agree; outcome
//      verbs must not conflict (stay vs resign, one-sided delay/cancel,
//      one-sided negation); tier words (Pro/Max/Plus/Ultra/Mini/Air) must
//      agree. Any veto wins over any overlap.
//
// A shared bigram alone is not enough: two different pieces about the same
// person ("Jensen Huang resigns" vs "Jensen Huang unveils a new chip", or
// two same-day opinion pieces that only share the name "Jensen Huang")
// would merge on that bigram. So a bigram match also needs real shared
// substance — at least 3 shared tokens, or Jaccard >= 0.6. The old
// subset shortcut (a short title's tokens being a subset of a long one)
// now needs the same substance floor counted BEYOND the bigram's own
// tokens: a 2-token title like "ChatGPT Wallet" no longer merges into an
// 8-token descriptive filing on the strength of the bigram alone. A bare
// high Jaccard (>= 0.67) clusters on its own, which covers word-order
// shuffles with no shared bigram.
//
// The primary of a cluster is its EARLIEST filing in the window, never the
// newest: the row's headline, lab and kind are stable across builds, so a
// story never re-posts to Telegram or the feed when a newer filing arrives.
// The window is measured from the primary, never chained through newer
// members, so a filing more than 48h after the primary starts a new
// cluster even if it duplicates a newer member.
//
// Known limit, stated honestly: two different tiers that both carry a tier
// word are vetoed, but a tier word the desk does not know (a new suffix)
// still falls through to the Jaccard rule. The mitigation is that
// clustering only ever hides a board row: the duplicate keeps its own /b/
// page, linked from the primary row, so a reader is one click away from it.
// If that trade-off ever proves wrong, the fix is a stricter threshold or
// an explicit block-list, not a model.
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
// same filing. Outcome verbs are NOT here — "resign", "step", "leave",
// "depart", "join", "appoint" and "name" are the thing itself: "X resigns"
// vs "X stays" must stay distinguishable, and the outcome guard below
// vetoes on them. Dropping them was the P0-1 defect that merged a
// resignation with a chip launch about the same person.
const CLUSTER_GENERIC_VERBS = new Set([
  "introduc", "launch", "releas", "announc", "unveil", "ship", "debut",
  "present", "publish", "post", "share", "bring", "avail",
]);

// Temporal filler, as stems.
const CLUSTER_FILLER = new Set(["now", "today", "here", "new", "first", "next", "latest", "just"]);

// A lab's name, as tokens ("The Verge" -> {"the", "verge"}). Used only
// by sharedLabNameStems, which decides for a PAIR of titles whether a
// lab-name token is a shared subject reference or the distinguishing
// subject. Stripping a lab's own name per title was the round-2 defect:
// it merged "NVIDIA posts record revenue" (NVIDIA) with "AMD posts record
// revenue" (AMD) — both reduced to [record, revenue] — and it broke
// identical short launch titles filed by the lab and a press desk
// ("OpenAI launches GPT-6" filed by OpenAI vs the same title filed by
// TechCrunch: the lab's filing lost "openai", the press filing kept it,
// and the 1-token remainder could not clear the bar).
function ownNameTokens(labLabel) {
  return new Set(String(labLabel || "").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));
}

// Raw tokens of a title, lowercased, hyphenated tokens also split into
// their parts, so "openai-powered" counts as containing "openai".
function rawTitleTokens(title) {
  const out = new Set();
  for (const token of String(title || "").toLowerCase().match(/(v?\d+(?:\.\d+)+)|([a-z0-9]+(?:-[a-z0-9]+)*)/g) || []) {
    out.add(token);
    if (token.includes("-")) for (const p of token.split("-")) out.add(p);
  }
  return out;
}

// Lab-name stems to drop from BOTH keyword lists of a pair: a lab-name
// token is dropped only when it occurs in BOTH raw titles. "OpenAI
// launches GPT-6" filed by OpenAI and by TechCrunch drops "openai" on
// both sides and still merges; "NVIDIA posts record revenue" filed by
// NVIDIA keeps "nvidia" and "AMD posts record revenue" filed by AMD
// keeps "amd", so the two revenue stories stay separate. A name that is
// neither filing's lab is an ordinary content token and is never dropped.
function sharedLabNameStems(aTitle, bTitle, aLab, bLab) {
  const inA = rawTitleTokens(aTitle);
  const inB = rawTitleTokens(bTitle);
  const drop = new Set();
  for (const name of [...ownNameTokens(aLab), ...ownNameTokens(bLab)]) {
    if (inA.has(name) && inB.has(name)) drop.add(stemToken(name));
  }
  return drop;
}

export function stemToken(token) {
  const t = String(token || "");
  if (/\d/.test(t) || t.length < 4) return t;
  for (const suffix of ["ing", "ed", "es", "s"]) {
    if (t.endsWith(suffix) && t.length - suffix.length >= 3) return t.slice(0, -suffix.length);
  }
  return t;
}

// Ordered, deduplicated content tokens of a title: version/model tokens
// ("v0.34.3", "gpt-5", "4") kept whole, stopwords, framing verbs and
// filler dropped, the rest light-stemmed. Lab names are NOT stripped
// here — that decision is pairwise (sharedLabNameStems, via
// tokensAreDuplicates), because only a pair can say whether a lab name
// is a shared subject reference or the distinguishing subject.
export function titleKeywords(title) {
  const raw = String(title || "").toLowerCase();
  const tokens = raw.match(/(v?\d+(?:\.\d+)+)|([a-z0-9]+(?:-[a-z0-9]+)*)/g) || [];
  const out = [];
  const seen = new Set();
  for (const token of tokens) {
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

// Shared tokens that are NOT part of any shared bigram: the substance a
// subset merge must carry beyond the bigram that merely names the story.
// "ChatGPT Wallet" shares its whole 2-token title with the bigram, so it
// scores 0 here and can no longer merge into a long filing on the subset
// shortcut alone.
function sharedBeyondBigram(a, b) {
  const setA = new Set(a);
  const setB = new Set(b);
  const bigramTokens = new Set();
  const bigrams = new Set();
  for (let i = 0; i + 1 < b.length; i += 1) bigrams.add(b[i] + " " + b[i + 1]);
  for (let i = 0; i + 1 < a.length; i += 1) {
    if (bigrams.has(a[i] + " " + a[i + 1])) {
      bigramTokens.add(a[i]);
      bigramTokens.add(a[i + 1]);
    }
  }
  let n = 0;
  for (const t of setA) if (setB.has(t) && !bigramTokens.has(t)) n += 1;
  return n;
}

// Outcome words, as stems: mutually exclusive outcomes about the same
// subject are different stories, whatever the overlap says. Staying vs
// leaving, a one-sided delay/cancel/kill/recall, and a negation on one
// side only all veto a merge. Verb AND noun forms are both in the sets:
// "resignation" / "departure" / "cancellation" / "postponement" veto
// exactly like "resigns" / "departs" / "cancels" / "postpones" — noun
// headlines were the round-2 defect that let "Jensen Huang's
// resignation" merge with "Jensen Huang stays". The list is explicit,
// not prefix matching, so "killer app" never false-vetoes.
const OUTCOME_STAY = new Set(["stay", "remain", "continu", "renew", "extend"]);
const OUTCOME_LEAVE = new Set(["resign", "step", "depart", "leav", "quit", "exit", "resignation", "departure"]);
const OUTCOME_NEGATIVE = new Set(["delay", "cancel", "kill", "recall", "halt", "paus", "postpon", "cancellation", "postponement"]);
// "no" followed by ". 1" is a ranking ("No. 1 AI model"), not a negation,
// so that shape is excluded from the negation check.
const NEGATION_RE = /\b(?:not|never|n't)\b|\bno\b(?!\.\s*\d)/i;

function tokenInGroup(tokens, group) {
  // A hyphenated token counts if any of its parts is in the group:
  // "step-down" is a leave word.
  for (const t of tokens) {
    if (group.has(t)) return true;
    if (t.includes("-") && t.split("-").some((p) => group.has(p))) return true;
  }
  return false;
}

function outcomeConflict(ka, kb, aTitle, bTitle) {
  const aStay = tokenInGroup(ka, OUTCOME_STAY);
  const bStay = tokenInGroup(kb, OUTCOME_STAY);
  const aLeave = tokenInGroup(ka, OUTCOME_LEAVE);
  const bLeave = tokenInGroup(kb, OUTCOME_LEAVE);
  if ((aStay && bLeave) || (bStay && aLeave)) return true;
  const aNeg = tokenInGroup(ka, OUTCOME_NEGATIVE);
  const bNeg = tokenInGroup(kb, OUTCOME_NEGATIVE);
  if (aNeg !== bNeg) return true;
  if (NEGATION_RE.test(aTitle || "") !== NEGATION_RE.test(bTitle || "")) return true;
  return false;
}

// Tier words: when the tier sets differ — one side carries a tier word and
// the other does not, or the two sides carry different tiers ("Pro" vs
// "Pro Max") — the filings are different products. This is deliberately a
// superset of the one-sided rule: two different tiers are different
// products too.
const TIER_WORDS = new Set(["pro", "max", "plus", "ultra", "mini", "air"]);

function tierConflict(ka, kb) {
  const ta = new Set(ka.filter((t) => TIER_WORDS.has(t)));
  const tb = new Set(kb.filter((t) => TIER_WORDS.has(t)));
  if (ta.size !== tb.size) return true;
  for (const t of ta) if (!tb.has(t)) return true;
  return false;
}

// { jaccard, sharedBigram, shared, subset, sharedBeyondBigram,
// digitConflict, outcomeConflict, tierConflict, duplicate } for two titles.
// Digit tokens must agree: if both titles carry digit tokens and the sets
// differ, the filings are different releases, whatever the overlap says.
// Outcome and tier vetoes work the same way. A lab-name token is dropped
// from both keyword lists first, but only when it occurs in both raw
// titles (sharedLabNameStems) — a shared subject reference, never the
// distinguishing subject. Otherwise: a high Jaccard clusters on its own;
// a shared bigram clusters only with real shared substance (at least 3
// shared tokens, or Jaccard >= 0.6); and a subset merge needs that same
// substance floor counted beyond the bigram's own tokens, so two
// different pieces that merely name the same person stay separate rows.
// ka/kb are precomputed titleKeywords arrays (clusterBriefs memoizes
// them); aTitle/bTitle are the raw titles, read for the negation check
// and the shared lab-name rule; aLab/bLab are the filing labs.
export function tokensAreDuplicates(ka, kb, aTitle, bTitle, aLab = "", bLab = "") {
  const drop = sharedLabNameStems(aTitle, bTitle, aLab, bLab);
  if (drop.size) {
    ka = ka.filter((t) => !drop.has(t));
    kb = kb.filter((t) => !drop.has(t));
  }
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
  const beyond = sharedBeyondBigram(ka, kb);
  const bigramSubstance =
    sharedBigram && (shared >= CLUSTER_BIGRAM_SHARED_MIN || score >= CLUSTER_BIGRAM_JACCARD_MIN);
  const subsetSubstance = subset && beyond >= CLUSTER_BIGRAM_SHARED_MIN;
  const outConflict = outcomeConflict(ka, kb, aTitle, bTitle);
  const tConflict = tierConflict(ka, kb);
  return {
    jaccard: score,
    sharedBigram,
    shared,
    subset,
    sharedBeyondBigram: beyond,
    digitConflict,
    outcomeConflict: outConflict,
    tierConflict: tConflict,
    duplicate:
      !digitConflict &&
      !outConflict &&
      !tConflict &&
      (score >= CLUSTER_JACCARD_MIN || bigramSubstance || subsetSubstance),
  };
}

export function titleSimilarity(aTitle, aLab, bTitle, bLab) {
  return tokensAreDuplicates(
    titleKeywords(aTitle),
    titleKeywords(bTitle),
    aTitle,
    bTitle,
    aLab,
    bLab,
  );
}

export function titlesAreDuplicates(aTitle, aLab, bTitle, bLab) {
  return titleSimilarity(aTitle, aLab, bTitle, bLab).duplicate;
}

// Greedy clustering over briefs in ANY order. The primary of a cluster is
// its EARLIEST filing in the window: stable across builds, so a story never
// changes headline, lab or kind when a newer filing arrives, and the
// Telegram queue never re-posts it. A later brief joins the first cluster
// whose primary it duplicates and which is at most windowMs older than it;
// the window is measured from the primary, never chained through newer
// members, so a filing more than 48h after the primary starts a new cluster
// even if it duplicates a newer member. Keywords are computed once per
// brief. Returns [{ primary, also: [brief, …] }] in newest-primary-first
// order, with `also` oldest-first. Pure: no brief is mutated, nothing is
// dropped.
export function clusterBriefs(briefs, windowMs = CLUSTER_WINDOW_MS) {
  const sorted = [...(briefs || [])].sort(
    (a, b) => new Date(a?.publishedAt) - new Date(b?.publishedAt),
  );
  const keywords = new Map();
  const kw = (brief) => {
    if (!keywords.has(brief)) {
      keywords.set(brief, titleKeywords(brief?.headline || ""));
    }
    return keywords.get(brief);
  };
  const clusters = [];
  for (const brief of sorted) {
    const at = new Date(brief?.publishedAt).getTime();
    if (Number.isNaN(at)) {
      clusters.push({ primary: brief, also: [] });
      continue;
    }
    let placed = false;
    for (const cluster of clusters) {
      const primaryAt = new Date(cluster.primary?.publishedAt).getTime();
      if (Number.isNaN(primaryAt)) continue;
      if (at - primaryAt > windowMs) continue;
      if (
        tokensAreDuplicates(
          kw(cluster.primary),
          kw(brief),
          cluster.primary?.headline || "",
          brief?.headline || "",
          cluster.primary?.lab || "",
          brief?.lab || "",
        ).duplicate
      ) {
        cluster.also.push(brief);
        placed = true;
        break;
      }
    }
    if (!placed) clusters.push({ primary: brief, also: [] });
  }
  return clusters.sort((a, b) => new Date(b.primary?.publishedAt) - new Date(a.primary?.publishedAt));
}

// Board rows from clusters: CLONES of the primaries carrying alsoFiled, so
// the board shows the annotation while the briefs themselves are never
// mutated — the archive, /week/ and /lab/ lists render from clean briefs.
// alsoFiled entries carry the guid so the queue can suppress a story that
// was already posted under an earlier primary.
export function boardPrimaries(clusters) {
  return (clusters || []).map(({ primary, also }) => {
    if (!also?.length) return primary;
    return {
      ...primary,
      alsoFiled: also.map((b) => ({
        guid: b.guid,
        lab: b.lab,
        labId: b.labId,
        path: b.path,
        headline: b.headline,
        dateLabel: b.dateLabel,
      })),
    };
  });
}

// The board leads with today's primaries, then backfills the most recent
// earlier ones so a quiet morning still shows a full board.
export function selectBoard(primaries, today, maxBriefs) {
  const byToday = primaries.filter((b) => b.dateLabel === today);
  return [
    ...byToday,
    ...primaries.filter((b) => b.dateLabel !== today).slice(0, Math.max(0, maxBriefs - byToday.length)),
  ];
}

// A story posts to Telegram once. A primary whose alsoFiled list contains a
// guid already in the posted ledger was already posted — under an earlier
// primary, before an older filing arrived and took over as primary — so it
// takes no new queue slot. (A primary that is itself already posted is
// filtered by telegram-desk.mjs, not here.)
export function queueFromBoard(briefs, posted = {}) {
  return (briefs || []).filter(
    (b) => !(b.alsoFiled || []).some((f) => f.guid && posted[f.guid]),
  );
}

// One line naming the other filings of the same story: lab, headline, date.
// Plain text — each surface escapes it for its own format. Shared by
// feed.json, RSS and the Telegram post so the three surfaces agree.
export function alsoFiledLine(alsoFiled) {
  if (!Array.isArray(alsoFiled) || !alsoFiled.length) return "";
  return (
    "Also filed by " +
    alsoFiled
      .map((f) => (f.lab || "") + ": " + (f.headline || "") + " (" + (f.dateLabel || "") + ")")
      .join(" · ")
  );
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
