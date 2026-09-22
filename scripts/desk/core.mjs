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
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));
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

export function strip(text) {
  return decode(text)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<img\b[^>]*>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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
    const summary = strip(tag(chunk, "description") || tag(chunk, "summary") || tag(chunk, "content") || tag(chunk, "content:encoded"));
    items.push({
      title: title.slice(0, 220),
      link,
      guid: strip(tag(chunk, "guid") || tag(chunk, "id") || link),
      publishedAt: published(chunk),
      summary: summary.slice(0, 2500),
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
  return title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 72) || "brief";
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

// Trim a summary to a display length the way an editor would: never cut a
// sentence in half. Whole sentences are kept while they still fit; a partial
// final sentence is dropped instead of clipped mid-word. An ellipsis is only
// added when the source genuinely continues past the last kept sentence.
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
  // Nothing fit as a whole sentence: take one sentence and trim it at a word
  // boundary rather than slicing a word in half.
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
  // The "what" answers the reader's only question on a brief page: what did
  // the source actually say? The source's own first sentences are always
  // better than anything generated to replace them, so the job here is to
  // carry those sentences intact, not to pad them. When the source gave us
  // nothing, say so plainly in one short line — a sentence about the desk
  // is not a substitute for a sentence about the news.
  let body = String(summary || "").replace(/\s+/g, " ").trim();
  if (!body) return lab + " published “" + headline + "” on " + dateLabel + ".";
  return clipSentence(body, 320);
}

export function composeWhy(lab, dateLabel, kind, topics, summary) {
  // The "why" is the one piece of desk-voice text on a brief: it says what
  // kind of thing this is, in one short line, so the reader can tell a launch
  // from a research note from a footnote. It must not restate the summary —
  // that is what `what` is for, and restating it is what makes a page read
  // machine-generated.
  const label = kind === "launch" ? "a launch filing" : kind === "research" ? "a research filing" : "a public note";
  const topicBit = topics.length ? " Tagged " + topics.map(topicLabel).join(" / ") + "." : "";
  return "Filed as " + label + " from " + lab + ", " + dateLabel + "." + topicBit;
}

export function sentences(text) {
  return text.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter((s) => s.length > 24 && s.length < 400);
}

export function factsFor(b) {
  const host = hostOf(b.source) || b.source;
  const method = b.via === "listing" ? "official HTML listing and article meta" : "official RSS";
  const out = [
    "Filed from the " + b.lab + " " + method + " on " + b.dateLabel + ".",
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
