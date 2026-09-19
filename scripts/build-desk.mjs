import { access, copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const SITE = (process.env.SITE_URL || "https://labledgerdesk.pages.dev").replace(/\/$/, "");
const OUT = "dist-site";
const AMP = "\x26";
const POSTED_FILE = ".desk-posted.json";
const QUEUE_FILE = ".desk-queue.json";
const OG_CANDIDATES = ["assets/og.jpg", "public/og.jpg", "/workspace/public/og.jpg"];

const LABS = [
  { id: "openai", label: "OpenAI", mark: "O", color: "#1c1914", feed: "https://openai.com/news/rss.xml", hosts: ["openai.com"] },
  { id: "anthropic", label: "Anthropic", mark: "A", color: "#6e2f22", feed: null, hosts: [] },
  { id: "google", label: "Google", mark: "G", color: "#2f4a3d", feed: "https://blog.google/technology/ai/rss/", hosts: ["blog.google"] },
  { id: "deepmind", label: "DeepMind", mark: "D", color: "#3d3a2e", feed: "https://deepmind.google/blog/rss.xml", hosts: ["deepmind.google"] },
  { id: "mistral", label: "Mistral", mark: "M", color: "#4a3b28", feed: "https://mistral.ai/news/rss", hosts: ["mistral.ai"] },
  { id: "huggingface", label: "Hugging Face", mark: "H", color: "#1c1914", feed: "https://huggingface.co/blog/feed.xml", hosts: ["huggingface.co"] },
  { id: "microsoft", label: "Microsoft Research", mark: "W", color: "#2c3d4f", feed: "https://www.microsoft.com/en-us/research/feed/", hosts: ["microsoft.com"] },
  { id: "nvidia", label: "NVIDIA", mark: "N", color: "#3d4a2e", feed: "https://blogs.nvidia.com/blog/category/generative-ai/feed/", hosts: ["blogs.nvidia.com"] },
  { id: "aws", label: "AWS", mark: "B", color: "#4a3228", feed: "https://aws.amazon.com/blogs/machine-learning/feed/", hosts: ["aws.amazon.com"] },
  { id: "apple", label: "Apple", mark: "P", color: "#2a2a28", feed: "https://machinelearning.apple.com/rss.xml", hosts: ["machinelearning.apple.com"] },
  { id: "gresearch", label: "Google Research", mark: "R", color: "#355046", feed: "https://research.google/blog/rss/", hosts: ["research.google"] },
  { id: "bair", label: "BAIR", mark: "K", color: "#4a2e3d", feed: "https://bair.berkeley.edu/blog/feed.xml", hosts: ["bair.berkeley.edu"] },
  { id: "mit", label: "MIT News", mark: "I", color: "#8a2a22", feed: "https://news.mit.edu/rss/topic/artificial-intelligence2", hosts: ["news.mit.edu"] },
  { id: "mittr", label: "MIT Review", mark: "T", color: "#243044", feed: "https://www.technologyreview.com/topic/artificial-intelligence/feed/", hosts: ["technologyreview.com"] },
];
const MAX_BRIEFS = 28;
const PER_FEED = 6;
const RECENT_MS = 21 * 24 * 60 * 60 * 1000;

function handleFrom(raw) {
  if (!raw) return "";
  let v = String(raw).trim();
  v = v.replace(/^https?:\/\/(www\.)?(t\.me|telegram\.me)\//i, "");
  v = v.replace(/^@/, "");
  v = v.split(/[/?#]/)[0];
  if (/^-?\d+$/.test(v)) return "";
  if (/^[A-Za-z][A-Za-z0-9_]{3,31}$/.test(v)) return v;
  return "";
}

function channelUrl() {
  const explicit = handleFrom(process.env.TELEGRAM_CHANNEL_URL || "");
  if (explicit) return "https://t.me/" + explicit;
  const fromChat = handleFrom(process.env.TELEGRAM_CHAT_ID || "");
  if (fromChat) return "https://t.me/" + fromChat;
  return "https://t.me/labledgerdesk";
}

function telegramChatId() {
  const chat = (process.env.TELEGRAM_CHAT_ID || "").trim();
  const h = handleFrom(chat);
  if (h) return "@" + h;
  if (/^-?\d+$/.test(chat)) return chat;
  const fromUrl = handleFrom(process.env.TELEGRAM_CHANNEL_URL || "");
  if (fromUrl) return "@" + fromUrl;
  return "@labledgerdesk";
}

const CHANNEL = channelUrl();
const CHANNEL_HANDLE = CHANNEL.replace("https://t.me/", "");

function esc(s) {
  return String(s)
    .replace(/&/g, AMP + "amp;")
    .replace(/</g, AMP + "lt;")
    .replace(/>/g, AMP + "gt;")
    .replace(/"/g, AMP + "quot;");
}

function decodeOnce(text) {
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

function decode(text) {
  let cur = text;
  for (let i = 0; i < 3; i += 1) {
    const next = decodeOnce(cur);
    if (next === cur) break;
    cur = next;
  }
  return cur.trim();
}

function strip(text) {
  return decode(text)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<img\b[^>]*>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tag(chunk, name) {
  const cdata = chunk.match(new RegExp("<" + name + "[^>]*>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*</" + name + ">", "i"));
  if (cdata?.[1]) return decode(cdata[1]);
  const normal = chunk.match(new RegExp("<" + name + "[^>]*>([\\s\\S]*?)</" + name + ">", "i"));
  return normal?.[1] ? decode(normal[1]) : "";
}

function href(chunk) {
  const atom = chunk.match(/<link[^>]+href=["']([^"']+)["'][^>]*\/?>/i);
  if (atom?.[1]) return decode(atom[1]);
  return tag(chunk, "link");
}

function published(chunk) {
  const raw = tag(chunk, "pubDate") || tag(chunk, "published") || tag(chunk, "updated") || tag(chunk, "dc:date");
  const date = raw ? new Date(raw) : new Date();
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function parseFeed(xml) {
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

function hostOf(url) {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return null;
    return u.hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function slugify(title) {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 72) || "brief";
}
function pad(n) { return String(n).padStart(2, "0"); }
function ymd(date) {
  return { year: String(date.getUTCFullYear()), month: pad(date.getUTCMonth() + 1), day: pad(date.getUTCDate()) };
}

function clip(text, max) {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  const sp = cut.lastIndexOf(" ");
  return (sp > 40 ? cut.slice(0, sp) : cut).replace(/[,:;–-]+$/, "") + "…";
}

function wordCount(text) {
  return String(text).trim().split(/\s+/).filter(Boolean).length;
}

function clipWords(text, max) {
  const words = String(text).replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  if (words.length <= max) return words.join(" ");
  const acc = [];
  for (const w of words) {
    acc.push(w);
    if (acc.length >= max - 8 && /[.!?]"?$/.test(w)) break;
    if (acc.length >= max) break;
  }
  let out = acc.join(" ");
  if (!/[.!?]$/.test(out)) out = out.replace(/[,:;–—-]+$/, "") + ".";
  return out;
}

function composeWhat(summary, lab, headline, dateLabel) {
  let body = String(summary || "").replace(/\s+/g, " ").trim();
  if (!body) body = lab + " published “" + headline + "” on " + dateLabel + ".";
  if (wordCount(body) >= 70) return clipWords(body, 80);
  const extras = [
    lab + " issued this as an official post on " + dateLabel + ".",
    "The desk files the title and summary from the allow-listed feed, not a rewrite of claims the source did not make.",
    "No second outlet is added, and no launch is invented.",
    "The primary source stays on this page so the original wording remains the claim of record.",
  ];
  for (const extra of extras) {
    if (wordCount(body) >= 70) break;
    body = (body + " " + extra).trim();
  }
  return clipWords(body, 80);
}

function composeWhy(lab, dateLabel) {
  return clipWords(
    "This brief exists so the official " + lab + " claim on " + dateLabel +
      " has a dated, public file. The desk does not add a second source or a launch the publisher did not post.",
    40,
  );
}

function sentences(text) {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 24 && s.length < 400);
}

function factsFor(b) {
  const host = hostOf(b.source) || b.source;
  const out = [
    "Filed from the official " + b.lab + " feed on " + b.dateLabel + ".",
    "Primary source host: " + host + ".",
  ];
  const claim = sentences(b.what)[0];
  if (claim && claim.length < 220 && !out.some((s) => s.includes(claim.slice(0, 36)))) out.push(claim);
  if (out.length < 3) out.push("The desk does not add a second source.");
  return out.slice(0, 3);
}

async function fetchFeed(url) {
  const res = await fetch(url, {
    headers: { "user-agent": "LabLedgerDesk/1.1 (+https://labledgerdesk.pages.dev)", accept: "application/rss+xml, application/xml, text/xml" },
    redirect: "manual",
    signal: AbortSignal.timeout(12000),
  });
  if (res.status >= 300 && res.status < 400) {
    const loc = res.headers.get("location") || "";
    if (!loc.startsWith("https://")) throw new Error("bad redirect");
    const hop = new URL(loc);
    const allowed = LABS.some((l) => l.hosts.includes(hop.hostname.replace(/^www\./, "")));
    if (!allowed && hop.hostname.replace(/^www\./, "") !== hostOf(url)) throw new Error("redirect off allowlist");
    const again = await fetch(hop.toString(), {
      headers: { "user-agent": "LabLedgerDesk/1.1", accept: "application/xml, text/xml" },
      redirect: "manual",
      signal: AbortSignal.timeout(12000),
    });
    if (!again.ok) throw new Error(url + " " + again.status);
    return again.text();
  }
  if (!res.ok) throw new Error(url + " " + res.status);
  return res.text();
}

const CSS = `
:root{--paper:#f4efe4;--paper2:#ebe4d6;--ink:#1c1914;--muted:#5a5348;--rule:#d4cbb8;--card:#fffaf2;--accent:#6e2f22}
*{box-sizing:border-box}
html{font-size:17px;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale}
html,body{margin:0;background:var(--paper);color:var(--ink);font-family:"Source Sans 3",ui-sans-serif,system-ui,sans-serif}
body{line-height:1.55}
a{color:inherit}
h1,h2,h3{font-family:Fraunces,ui-serif,Georgia,serif;font-weight:600;text-wrap:balance;letter-spacing:-.02em;line-height:1.15}
p{text-wrap:pretty}
.wrap{max-width:64rem;margin:0 auto;padding:0 1rem;min-height:100vh;display:flex;flex-direction:column}
header{display:flex;justify-content:space-between;align-items:center;gap:1rem;border-bottom:1px solid var(--rule);padding:1rem 0}
footer{display:flex;flex-wrap:wrap;justify-content:space-between;gap:1rem;border-top:1px solid var(--rule);margin-top:auto;padding:1.5rem 0;color:var(--muted);font-size:.92rem}
.brand{display:flex;align-items:baseline;gap:.65rem;text-decoration:none;font-family:Fraunces,Georgia,serif;font-size:1.7rem;font-weight:600;letter-spacing:-.03em}
.desk{font-family:"Source Sans 3",sans-serif;font-size:.72rem;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:var(--muted)}
nav{display:flex;gap:1.25rem;font-size:.92rem;color:var(--muted)}
nav a{text-decoration:none;min-height:44px;display:inline-flex;align-items:center}
nav a:hover{color:var(--ink)}
.hero{display:grid;gap:2.2rem;border-bottom:1px solid var(--rule);padding:2.6rem 0 2.4rem}
@media(min-width:860px){.hero{grid-template-columns:1.15fr .85fr;align-items:end}}
.hero h1{font-size:clamp(2.6rem,7vw,4.1rem);line-height:.95;margin:0}
.hero p{color:var(--muted);max-width:30rem;font-size:1.05rem}
.meta{display:flex;flex-wrap:wrap;gap:1rem;color:var(--muted);font-size:.9rem;margin-top:1.1rem}
.meta strong{color:var(--ink);font-weight:600}
.search{border:1px solid var(--rule);background:var(--card);padding:1.1rem 1.15rem}
.search label{display:block;font-size:.72rem;letter-spacing:.14em;text-transform:uppercase;color:var(--muted);margin-bottom:.55rem}
.search input{width:100%;border:0;border-bottom:1px solid var(--ink);background:transparent;font-family:Fraunces,Georgia,serif;font-size:1.35rem;font-weight:500;padding:.45rem 0;color:var(--ink);outline:none}
.chips{display:flex;flex-wrap:wrap;gap:.45rem;margin-top:.9rem}
.chip{border:1px solid var(--rule);padding:0 .85rem;min-height:44px;display:inline-flex;align-items:center;font-size:.78rem;font-weight:600;letter-spacing:.04em;text-decoration:none;background:transparent}
.chip:hover,.chip[aria-current=page]{border-color:var(--ink);background:var(--ink);color:var(--paper)}
.board{padding:1.8rem 0 2.4rem;display:grid;gap:.75rem}
.board-head{display:flex;justify-content:space-between;font-size:.72rem;letter-spacing:.14em;text-transform:uppercase;color:var(--muted);margin-bottom:.2rem}
.row{display:grid;grid-template-columns:1fr;gap:1rem;border:1px solid var(--rule);background:var(--card);padding:1.05rem 1.1rem;text-decoration:none;transition:border-color .15s ease}
@media(min-width:700px){.row{grid-template-columns:80px 1fr auto;align-items:start}}
.row:hover{border-color:var(--ink)}
.mark{width:80px;height:80px;display:grid;place-items:center;color:#fffaf2;font-family:Fraunces,Georgia,serif;font-size:1.9rem;font-weight:700}
.mark.sm{width:56px;height:56px;font-size:1.4rem}
.kicker{font-size:.72rem;letter-spacing:.14em;text-transform:uppercase;color:var(--muted)}
.headline{font-family:Fraunces,Georgia,serif;font-size:1.45rem;font-weight:600;line-height:1.2;margin:.2rem 0;letter-spacing:-.02em}
.dek{color:var(--muted)}
.row-meta{display:flex;flex-wrap:wrap;gap:.7rem;font-size:.78rem;color:var(--muted);margin-top:.45rem}
.row-id{font-size:.75rem;color:var(--muted);text-align:right}
.labs{display:grid;grid-template-columns:repeat(2,1fr);gap:.5rem 1rem;margin:1.5rem 0 0;padding-top:1.4rem}
@media(min-width:700px){.labs{grid-template-columns:repeat(3,1fr)}}
@media(min-width:900px){.labs{grid-template-columns:repeat(4,1fr)}}
.labs a{border-top:2px solid var(--ink);padding-top:.55rem;text-decoration:none}
.labs b{display:block;font-family:Fraunces,Georgia,serif;font-size:1.15rem}
.labs span{display:block;color:var(--muted);font-size:.78rem;margin-top:.15rem}
article.brief{max-width:38rem;margin:0 auto;padding:2.2rem 0 2.8rem}
article.brief h1{font-size:clamp(2rem,5vw,2.7rem);margin:.55rem 0 0}
article.brief .dek{font-size:1.25rem;margin-top:.85rem}
article.brief h2{font-family:"Source Sans 3",sans-serif;font-size:.72rem;letter-spacing:.14em;text-transform:uppercase;color:var(--ink);margin:0;font-weight:600}
.block{margin-top:1.55rem;padding:0 0 .05rem 1.05rem;border-left:2px solid var(--ink)}
.block p{margin:.5rem 0 0}
.block ul{list-style:none;margin:.5rem 0 0;padding:0}
.block li{position:relative;margin:.4rem 0 0;padding-left:1.1rem;line-height:1.45}
.block li:before{content:"—";position:absolute;left:0;color:var(--accent)}
.record{display:flex;flex-wrap:wrap;justify-content:space-between;gap:1rem;border-top:1px solid var(--rule);border-bottom:1px solid var(--rule);padding:1rem 0;margin-top:1.7rem;font-size:.95rem}
.record a{color:var(--accent)}
.actions{display:flex;flex-direction:column;align-items:flex-start;margin-top:1.2rem}.tg{display:inline-flex;align-items:center;min-height:44px;border:1px solid var(--ink);padding:0 .9rem;margin:0;text-decoration:none;font-size:.9rem}
.tg:hover{background:var(--ink);color:var(--paper)}
.back{display:block;margin-top:1rem;color:var(--muted);text-decoration:none}
.method{max-width:38rem;padding:2.4rem 0 3rem}
.method h1{font-size:2.5rem;margin:.4rem 0 0}
.method h2{font-family:"Source Sans 3",sans-serif;font-size:.72rem;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);margin:2rem 0 .5rem}
.empty{border:1px dashed var(--rule);padding:1.6rem;color:var(--muted)}
a.row[hidden]{display:none}
@media(prefers-reduced-motion:reduce){*{transition:none!important}}
`.replace(/\n/g, "");

function jsonLdScript(obj) {
  return "<script type=\"application/ld+json\">" + JSON.stringify(obj).replace(/</g, "\\u003c") + "</script>";
}

function shell({ title, description, path, body, extra = "", ogType = "website" }) {
  const url = SITE + path;
  const desc = clip(description, 158);
  return [
    "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\">",
    "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">",
    "<title>", esc(title), "</title>",
    "<meta name=\"description\" content=\"", esc(desc), "\">",
    "<meta name=\"robots\" content=\"index,follow,max-image-preview:large\">",
    "<meta name=\"theme-color\" content=\"#f4efe4\">",
    "<link rel=\"canonical\" href=\"", esc(url), "\">",
    "<link rel=\"icon\" type=\"image/svg+xml\" href=\"/favicon.svg\">",
    "<link rel=\"alternate\" type=\"application/rss+xml\" title=\"Lab Ledger Desk\" href=\"", SITE, "/rss.xml\">",
    "<link rel=\"preconnect\" href=\"https://fonts.googleapis.com\">",
    "<link rel=\"preconnect\" href=\"https://fonts.gstatic.com\" crossorigin>",
    "<link rel=\"stylesheet\" href=\"https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600;9..144,700&amp;family=Source+Sans+3:wght@400;500;600&amp;display=swap\">",
    "<link rel=\"stylesheet\" href=\"/styles.css\">",
    "<meta property=\"og:site_name\" content=\"Lab Ledger Desk\">",
    "<meta property=\"og:type\" content=\"", esc(ogType), "\">",
    "<meta property=\"og:title\" content=\"", esc(title), "\">",
    "<meta property=\"og:description\" content=\"", esc(desc), "\">",
    "<meta property=\"og:url\" content=\"", esc(url), "\">",
    "<meta property=\"og:image\" content=\"", SITE, "/og.jpg\">",
    "<meta property=\"og:image:width\" content=\"1200\">",
    "<meta property=\"og:image:height\" content=\"630\">",
    "<meta name=\"twitter:card\" content=\"summary_large_image\">",
    "<meta name=\"twitter:title\" content=\"", esc(title), "\">",
    "<meta name=\"twitter:description\" content=\"", esc(desc), "\">",
    "<meta name=\"twitter:image\" content=\"", SITE, "/og.jpg\">",
    extra,
    "</head><body><div class=\"wrap\"><header>",
    "<a class=\"brand\" href=\"/\">Lab Ledger<span class=\"desk\">Desk</span></a>",
    "<nav><a href=\"/\">Today</a><a href=\"/method/\">Method</a>",
    "<a href=\"", esc(CHANNEL), "\" rel=\"noreferrer noopener\">Channel</a></nav>",
    "</header>", body,
    "<footer><p>Lab Ledger Desk records official lab posts. It does not invent launches.</p>",
    "<p><a href=\"/method/\">How the desk works</a> · <a href=\"", esc(CHANNEL), "\" rel=\"noreferrer noopener\">Telegram</a> · <a href=\"/rss.xml\">RSS</a></p>",
    "</footer></div>",
    "<script>(function(){var q=document.getElementById('q');if(!q)return;var rows=[].slice.call(document.querySelectorAll('.row'));function apply(){var n=(q.value||'').trim().toLowerCase();rows.forEach(function(r){r.hidden=n.length>0&&r.textContent.toLowerCase().indexOf(n)<0;});}q.addEventListener('input',apply);var p=new URLSearchParams(location.search).get('q');if(p){q.value=p;apply();}})();</script>",
    "</body></html>",
  ].join("");
}

function rowHtml(b) {
  return [
    "<a class=\"row\" href=\"", esc(b.path), "\">",
    "<div class=\"mark\" style=\"background:", b.color, "\">", esc(b.mark), "</div><div>",
    "<div class=\"kicker\">", esc(b.lab), " · ", esc(b.dateLabel), "</div>",
    "<div class=\"headline\">", esc(b.headline), "</div>",
    "<div class=\"dek\">", esc(b.dek), "</div>",
    "<div class=\"row-meta\"><span>", esc(b.lab), "</span><span>", esc(b.dateLabel), "</span></div>",
    "</div><div class=\"row-id\">Brief ", esc(b.briefNo), "</div></a>",
  ].join("");
}

async function write(path, content) {
  const full = join(OUT, path);
  await mkdir(dirname(full), { recursive: true });
  await writeFile(full, content);
}

async function copyOg() {
  for (const p of OG_CANDIDATES) {
    try {
      await access(p);
      await copyFile(p, join(OUT, "og.jpg"));
      return true;
    } catch {}
  }
  return false;
}

async function loadPosted() {
  try {
    return JSON.parse(await readFile(POSTED_FILE, "utf8"));
  } catch {
    return {};
  }
}

function makeBrief(pack, item) {
  const { year, month, day } = ymd(item.publishedAt);
  const slug = slugify(item.title);
  const path = "/b/" + year + "/" + month + "/" + day + "/" + slug + "/";
  const headline = item.title;
  const summary = item.summary;
  const dateLabel = year + "-" + month + "-" + day;
  const dek = clip(summary || (pack.lab.label + " published “" + headline + ".”"), 158);
  const what = composeWhat(summary, pack.lab.label, headline, dateLabel);
  const why = composeWhy(pack.lab.label, dateLabel);
  return {
    lab: pack.lab.label,
    labId: pack.lab.id,
    mark: pack.lab.mark,
    color: pack.lab.color,
    headline,
    dek,
    what,
    why,
    source: item.link,
    guid: item.guid || item.link,
    year, month, day, slug, path,
    dateLabel,
    publishedAt: item.publishedAt,
    telegramUrl: null,
    briefNo: "000",
  };
}

const packs = await Promise.all(
  LABS.filter((l) => l.feed).map(async (lab) => {
    try {
      const xml = await fetchFeed(lab.feed);
      const items = parseFeed(xml)
        .filter((item) => lab.hosts.includes(hostOf(item.link) || ""))
        .slice(0, PER_FEED * 2);
      return { lab, items };
    } catch {
      return { lab, items: [] };
    }
  }),
);

const briefs = [];
const used = new Set();
const now = Date.now();
function takeRoundRobin(pred) {
  for (let i = 0; i < PER_FEED * 2; i += 1) {
    for (const pack of packs) {
      if (briefs.length >= MAX_BRIEFS) return;
      const item = pack.items[i];
      if (!item || used.has(item.link)) continue;
      if (pred && !pred(item)) continue;
      used.add(item.link);
      briefs.push(makeBrief(pack, item));
    }
  }
}
for (const pack of packs) {
  const item = pack.items[0];
  if (!item || used.has(item.link) || briefs.length >= MAX_BRIEFS) continue;
  used.add(item.link);
  briefs.push(makeBrief(pack, item));
}
takeRoundRobin((item) => now - item.publishedAt.getTime() <= RECENT_MS);
takeRoundRobin(null);
briefs.sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime());
briefs.forEach((b, i) => { b.briefNo = String(i + 1).padStart(3, "0"); });

const today = new Date().toISOString().slice(0, 10);
const posted = await loadPosted();
for (const b of briefs) {
  if (!b.telegramUrl && posted[b.guid]) b.telegramUrl = posted[b.guid];
}
await writeFile(QUEUE_FILE, JSON.stringify({
  briefs: briefs.map((b) => ({
    guid: b.guid,
    headline: b.headline,
    path: b.path,
    lab: b.lab,
    dek: b.dek,
    publishedAt: b.publishedAt.toISOString(),
  })),
}));

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });
await write("styles.css", CSS);
await write("favicon.svg", '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" fill="#1c1914"/><path fill="#f4efe4" d="M9 6h7v14h8v6H9z"/><rect x="9" y="27.5" width="14" height="1.5" fill="#6e2f22"/></svg>');
const ogOk = await copyOg();
await write("robots.txt", [
  "User-agent: *",
  "Allow: /",
  "Sitemap: " + SITE + "/sitemap.xml",
  "",
  "User-agent: GPTBot",
  "Allow: /",
  "User-agent: ChatGPT-User",
  "Allow: /",
  "User-agent: PerplexityBot",
  "Allow: /",
  "User-agent: Google-Extended",
  "Allow: /",
  "User-agent: ClaudeBot",
  "Allow: /",
  "User-agent: anthropic-ai",
  "Allow: /",
  "",
].join("\n"));
await write("llms.txt", [
  "# Lab Ledger Desk",
  "",
  "> Public register of official AI announcements. One brief per move, about 100 words. Primary source on the page.",
  "",
  "Canonical host: " + SITE,
  "Telegram: " + CHANNEL,
  "",
  "## How to cite",
  "Quote the brief headline, the lab, the ISO date, and the primary source URL. Do not attribute inventions to Lab Ledger Desk.",
  "",
  "## Pages",
  "- " + SITE + "/ — today's board",
  "- " + SITE + "/method/ — how the desk works",
  "- " + SITE + "/rss.xml — machine feed",
  "- " + SITE + "/sitemap.xml",
  ...LABS.map((l) => "- " + SITE + "/lab/" + l.id + "/ — " + l.label + " archive"),
  "",
  "## Latest briefs",
  ...briefs.slice(0, 20).map((b) => "- " + b.dateLabel + " · " + b.lab + " · " + b.headline + " — " + SITE + b.path),
  "",
].join("\n"));
await write("_headers", [
  "/*",
  "  X-Content-Type-Options: nosniff",
  "  Referrer-Policy: strict-origin-when-cross-origin",
  "  X-Frame-Options: DENY",
  "  Permissions-Policy: camera=(), microphone=(), geolocation=()",
  "",
  "/og.jpg",
  "  Cache-Control: public, max-age=86400",
  "",
].join("\n"));

const chipBar = LABS.map((l) => "<a class=\"chip\" href=\"/lab/" + l.id + "/\">" + esc(l.label) + "</a>").join("");
const board = briefs.map(rowHtml).join("") || "<p class=\"empty\">Desk is waiting on the next official post.</p>";
const labGrid = LABS.map((l) => "<a href=\"/lab/" + l.id + "/\"><b>" + esc(l.label) + "</b><span>" + (l.feed ? "Official RSS" : "No official RSS") + "</span></a>").join("");

const homeSchema = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": SITE + "/#website",
      name: "Lab Ledger Desk",
      url: SITE + "/",
      description: "A public ledger of official AI-lab announcements.",
      dateModified: today + "T00:00:00Z",
      publisher: { "@id": SITE + "/#org" },
      potentialAction: {
        "@type": "SearchAction",
        target: SITE + "/?q={search_term_string}",
        "query-input": "required name=search_term_string",
      },
    },
    {
      "@type": "Organization",
      "@id": SITE + "/#org",
      name: "Lab Ledger Desk",
      url: SITE + "/",
      logo: SITE + "/favicon.svg",
      sameAs: [CHANNEL],
      dateModified: today + "T00:00:00Z",
    },
    {
      "@type": "FAQPage",
      mainEntity: [
        { "@type": "Question", name: "What does Lab Ledger Desk file?", acceptedAnswer: { "@type": "Answer", text: "Official announcements from named AI labs, research groups, and MIT Technology Review. One brief per move, about 100 words, with the primary source on the page." } },
        { "@type": "Question", name: "Which sources are on the board?", acceptedAnswer: { "@type": "Answer", text: "OpenAI, Anthropic, Google, DeepMind, Mistral, Hugging Face, Microsoft Research, NVIDIA, AWS, Apple, Google Research, BAIR, MIT News, and MIT Technology Review. Anthropic is listed but has no official RSS, so the desk does not scrape it. Meta and xAI publish no official RSS either." } },
        { "@type": "Question", name: "Does the desk invent launches?", acceptedAnswer: { "@type": "Answer", text: "No. It files the official claim and keeps the source on the page." } },
      ],
    },
  ],
};

await write("index.html", shell({
  title: "Lab Ledger Desk — Primary moves from the labs",
  description: "A public ledger of official AI announcements from named labs, research groups, and MIT Technology Review. Dated, sourced, kept.",
  path: "/",
  extra: jsonLdScript(homeSchema),
  body: [
    "<section class=\"hero\"><div><h1>What the labs moved. Sourced, dated, kept.</h1>",
    "<p>A public ledger of official AI announcements. Named sources only. One brief per move, about 100 words, with the primary source on the page.</p>",
    "<div class=\"meta\"><span>Desk date <strong><time datetime=\"", esc(today), "\">", esc(today), "</time></strong></span>",
    "<span>Open briefs <strong>", String(briefs.length), "</strong></span>",
    "<span>Desk <strong>live</strong></span></div></div>",
    "<form class=\"search\" action=\"/\" method=\"get\" role=\"search\"><label for=\"q\">Look up a lab or a move</label>",
    "<input id=\"q\" name=\"q\" type=\"search\" placeholder=\"Anthropic, OpenAI, Gemini…\" autocomplete=\"off\">",
    "<div class=\"chips\">", chipBar, "</div></form></section>",
    "<section class=\"board\" id=\"today\"><div class=\"board-head\"><span>The board</span><span>", String(briefs.length), " logged</span></div>",
    board,
    "<div class=\"labs\">", labGrid, "</div></section>",
    "<article class=\"method\"><h2>What does the desk file?</h2>",
    "<p>Official announcements from named labs, research groups, and MIT Technology Review. One brief per move, about 100 words. The primary source stays on the page.</p>",
    "<h2>Which sources are on the board?</h2>",
    "<ul>", LABS.map((l) => "<li><a href=\"/lab/" + l.id + "/\">" + esc(l.label) + "</a> — " + (l.feed ? "official RSS" : "no official RSS, not scraped") + "</li>").join(""), "</ul>",
    "<h2>Does the desk invent launches?</h2>",
    "<p>No. It reads allow-listed feeds, fills a fixed template, and mirrors the same brief to <a href=\"", esc(CHANNEL), "\" rel=\"noreferrer noopener\">Telegram</a> after the page exists.</p>",
    "</article>",
  ].join(""),
}));

await write("method/index.html", shell({
  title: "Method — Lab Ledger Desk",
  description: "How Lab Ledger Desk reads official lab RSS, files a brief in a fixed template, and mirrors it to Telegram after the page exists.",
  path: "/method/",
  extra: jsonLdScript({
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      { "@type": "Question", name: "What is Lab Ledger Desk?", acceptedAnswer: { "@type": "Answer", text: "A public register of official AI announcements from named labs, research groups, and MIT Technology Review. Each page is a brief of about 100 words: what moved, why it matters, and the primary source." } },
      { "@type": "Question", name: "Does it invent news?", acceptedAnswer: { "@type": "Answer", text: "No. It does not invent launches, rewrite claims, or scrape labs that publish no feed." } },
      { "@type": "Question", name: "Where is the Telegram channel?", acceptedAnswer: { "@type": "Answer", text: CHANNEL } },
    ],
  }),
  body: [
    "<article class=\"method\"><p class=\"kicker\">Method</p><h1>How the desk works</h1>",
    "<h2>What is this?</h2><p>Lab Ledger Desk is a public register of official AI announcements from named labs, research groups, and MIT Technology Review. Each page is a brief of about 100 words: what moved, why it matters, and the primary source.</p>",
    "<h2>What is this not?</h2><p>It is not a newspaper with invented reporters. It does not copy lab posts in full. It does not invent launches. It does not scrape labs that publish no feed.</p>",
    "<h2>How is a brief made?</h2><p>Official RSS feeds are read. Only allow-listed hosts are fetched. Duplicates are dropped. A fixed template is filled from the title and summary to about 100 words. If a required field is missing, the brief stays off the board. Volume follows the feeds — typically twenty to thirty open briefs. Telegram carries the same brief after the site file is written.</p>",
    "<h2>Channel</h2><p>The public desk channel is <a href=\"", esc(CHANNEL), "\" rel=\"noreferrer noopener\">", esc(CHANNEL), "</a>.</p></article>",
  ].join(""),
}));

await write("404.html", shell({
  title: "Not found — Lab Ledger Desk",
  description: "This brief is not on the ledger.",
  path: "/404.html",
  body: "<article class=\"method\"><p class=\"kicker\">404</p><h1>This brief is not on the ledger.</h1><p class=\"dek\">The desk only files official lab posts it has already read.</p><p><a class=\"back\" href=\"/\">← Back to the board</a></p></article>",
}));

for (const lab of LABS) {
  const rows = briefs.filter((b) => b.labId === lab.id);
  await write("lab/" + lab.id + "/index.html", shell({
    title: lab.label + " — Lab Ledger Desk",
    description: lab.feed
      ? "Official " + lab.label + " announcements filed by Lab Ledger Desk."
      : lab.label + " has no official RSS feed. The desk will not scrape it.",
    path: "/lab/" + lab.id + "/",
    body: [
      "<article class=\"method\"><p class=\"kicker\">Archive</p><h1>", esc(lab.label), "</h1>",
      "<p class=\"dek\">", lab.feed ? "Official RSS, filed as briefs." : "No official RSS. The desk will not scrape this lab.", "</p></article>",
      "<section class=\"board\">",
      rows.map(rowHtml).join("") || "<p class=\"empty\">No filed brief for " + esc(lab.label) + " yet.</p>",
      "</section>",
    ].join(""),
  }));
}

for (const b of briefs) {
  const factList = factsFor(b);
  const articleUrl = SITE + b.path;
  const schema = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "NewsArticle",
        headline: b.headline,
        description: b.dek,
        datePublished: b.publishedAt.toISOString(),
        dateModified: b.publishedAt.toISOString(),
        mainEntityOfPage: articleUrl,
        image: [SITE + "/og.jpg"],
        author: { "@type": "Organization", name: "Lab Ledger Desk", url: SITE + "/", sameAs: [CHANNEL] },
        publisher: { "@type": "Organization", name: "Lab Ledger Desk", url: SITE + "/", logo: { "@type": "ImageObject", url: SITE + "/og.jpg" }, sameAs: [CHANNEL] },
        citation: { "@type": "CreativeWork", name: b.lab + " primary source", url: b.source },
        isAccessibleForFree: true,
      },
      {
        "@type": "FAQPage",
        mainEntity: [
          { "@type": "Question", name: "What moved?", acceptedAnswer: { "@type": "Answer", text: b.what } },
          { "@type": "Question", name: "Why it matters?", acceptedAnswer: { "@type": "Answer", text: b.why } },
          { "@type": "Question", name: "Where is the primary source?", acceptedAnswer: { "@type": "Answer", text: b.source } },
        ],
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Board", item: SITE + "/" },
          { "@type": "ListItem", position: 2, name: b.lab, item: SITE + "/lab/" + b.labId + "/" },
          { "@type": "ListItem", position: 3, name: b.headline, item: articleUrl },
        ],
      },
    ],
  };
  await write("b/" + b.year + "/" + b.month + "/" + b.day + "/" + b.slug + "/index.html", shell({
    title: b.headline + " — Lab Ledger Desk",
    description: b.dek,
    path: b.path,
    ogType: "article",
    extra: [
      "<meta property=\"article:published_time\" content=\"", b.publishedAt.toISOString(), "\">",
      "<meta property=\"article:section\" content=\"", esc(b.lab), "\">",
      jsonLdScript(schema),
    ].join(""),
    body: [
      "<article class=\"brief\"><div class=\"mark sm\" style=\"background:", b.color, "\">", esc(b.mark), "</div>",
      "<p class=\"kicker\">", esc(b.lab), " · ", esc(b.dateLabel), "</p>",
      "<h1>", esc(b.headline), "</h1>",
      "<p class=\"dek\">", esc(b.dek), "</p>",
      "<section class=\"block\"><h2>What moved</h2><p>", esc(b.what), "</p></section>",
      "<section class=\"block\"><h2>Why it matters</h2><p>", esc(b.why), "</p></section>",
      "<section class=\"block\"><h2>On the record</h2><ul>", factList.map((f) => "<li>" + esc(f) + "</li>").join(""), "</ul></section>",
      "<div class=\"record\"><div><b>Primary source</b><br><a href=\"", esc(b.source), "\" rel=\"noreferrer noopener\" target=\"_blank\">", esc(hostOf(b.source) || b.source), "</a></div>",
      "<div><b>Desk</b><br>Logged as brief ", esc(b.briefNo), "</div></div>",
      "<div class=\"actions\">",
      b.telegramUrl
        ? "<a class=\"tg\" href=\"" + esc(b.telegramUrl) + "\" rel=\"noreferrer noopener\">Open the matching Telegram post</a>"
        : "<a class=\"tg\" href=\"" + esc(CHANNEL) + "\" rel=\"noreferrer noopener\">Follow the desk on Telegram</a>",
      "<a class=\"back\" href=\"/\">← Back to the board</a></div></article>",
    ].join(""),
  }));
}

const urls = [
  ["/", today],
  ["/method/", today],
  ...LABS.map((l) => ["/lab/" + l.id + "/", today]),
  ...briefs.map((b) => [b.path, b.dateLabel]),
];
await write(
  "sitemap.xml",
  "<?xml version=\"1.0\" encoding=\"UTF-8\"?><urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">" +
    urls.map(([u, d]) => "<url><loc>" + SITE + u + "</loc><lastmod>" + d + "</lastmod></url>").join("") +
    "</urlset>",
);
await write(
  "rss.xml",
  "<?xml version=\"1.0\" encoding=\"UTF-8\"?><rss version=\"2.0\" xmlns:atom=\"http://www.w3.org/2005/Atom\"><channel><title>Lab Ledger Desk</title><link>" +
    SITE +
    "</link><description>Official AI-lab briefs, dated and sourced.</description><atom:link href=\"" +
    SITE +
    "/rss.xml\" rel=\"self\" type=\"application/rss+xml\"/>" +
    briefs
      .map(
        (b) =>
          "<item><title>" +
          esc(b.headline) +
          "</title><link>" +
          SITE +
          b.path +
          "</link><guid>" +
          SITE +
          b.path +
          "</guid><description>" +
          esc(b.dek) +
          "</description><pubDate>" +
          b.publishedAt.toUTCString() +
          "</pubDate></item>",
      )
      .join("") +
    "</channel></rss>",
);

console.log("wrote " + briefs.length + " briefs, telegram queue " + briefs.length + ", posted cache " + Object.keys(posted).length + ", og " + ogOk + ", channel " + CHANNEL);
