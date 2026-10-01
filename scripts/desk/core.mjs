import { AMP, KINDS, TOPICS } from "./config.mjs";
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
  // C7 (CodeQL js/bad-tag-filter): the classic bypass is a nested tag —
  // "<scr<script>ipt>" collapses back into "<script>" once the inner pair is
  // removed. The CodeQL-accepted shape is a greedy match from an anchored
  // start ("<" at the beginning of a tag) through the *last* close, so there
  // is no leftover fragment left to recombine; the loop then repeats the whole
  // pass until the text is stable. The trailing `[^>]*$` guard removes an
  // unterminated tag ("<img src=x") that a `[^>]+>` match cannot see.
  let out = decode(text);
  for (let i = 0; i < 8; i += 1) {
    const next = out
      .replace(/<script\b[\s\S]*<\/script>/gi, " ")
      .replace(/<style\b[\s\S]*<\/style>/gi, " ")
      .replace(/<img\b[^>]*>/gi, " ")
      .replace(/<[^<>]*>/g, " ")
      .replace(/<[^>]*$/, " ")
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
