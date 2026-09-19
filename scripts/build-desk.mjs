import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const SITE = (process.env.SITE_URL || "https://labledgerdesk.pages.dev").replace(/\/$/, "");
const CHANNEL = "https://t.me/labledger";
const OUT = "dist-site";
const AMP = "\x26";

const LABS = [
  { id: "openai", label: "OpenAI", mark: "O", color: "#1c1914", feed: "https://openai.com/news/rss.xml", hosts: ["openai.com"] },
  { id: "anthropic", label: "Anthropic", mark: "A", color: "#6e2f22", feed: null, hosts: [] },
  { id: "google", label: "Google", mark: "G", color: "#2f4a3d", feed: "https://blog.google/technology/ai/rss/", hosts: ["blog.google"] },
  { id: "deepmind", label: "DeepMind", mark: "D", color: "#3d3a2e", feed: "https://deepmind.google/blog/rss.xml", hosts: ["deepmind.google"] },
  { id: "mistral", label: "Mistral", mark: "M", color: "#4a3b28", feed: "https://mistral.ai/news/rss", hosts: ["mistral.ai"] },
  { id: "huggingface", label: "Hugging Face", mark: "H", color: "#1c1914", feed: "https://huggingface.co/blog/feed.xml", hosts: ["huggingface.co"] },
];

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
    const link = href(chunk).split("?")[0];
    if (!title || !link.startsWith("https://")) continue;
    const summary = strip(tag(chunk, "description") || tag(chunk, "summary") || tag(chunk, "content") || tag(chunk, "content:encoded"));
    items.push({ title: title.slice(0, 220), link, guid: strip(tag(chunk, "guid") || tag(chunk, "id") || link), publishedAt: published(chunk), summary: summary.slice(0, 800) });
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

async function fetchFeed(url) {
  const res = await fetch(url, {
    headers: { "user-agent": "LabLedgerDesk/1.0", accept: "application/xml, text/xml" },
    redirect: "follow",
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) throw new Error(url + " " + res.status);
  return res.text();
}

const CSS = [
  ":root{--paper:#f4efe4;--paper2:#ebe4d6;--ink:#1c1914;--muted:#5a5348;--rule:#d4cbb8;--card:#fffaf2;--accent:#6e2f22}",
  "*{box-sizing:border-box}html,body{margin:0;background:var(--paper);color:var(--ink);font-family:Georgia,serif}",
  "a{color:inherit}h1,h2,h3{font-family:Georgia,serif;font-weight:600}",
  ".wrap{max-width:56rem;margin:0 auto;padding:0 1rem;min-height:100vh;display:flex;flex-direction:column}",
  "header,footer{display:flex;justify-content:space-between;gap:1rem;border-bottom:1px solid var(--rule);padding:1rem 0}",
  "footer{border-bottom:0;border-top:1px solid var(--rule);margin-top:auto;padding:1.5rem 0;color:var(--muted);font-size:.9rem}",
  ".brand{font-size:1.5rem;text-decoration:none}.desk{font-size:.75rem;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin-left:.6rem}",
  "nav{display:flex;gap:1.2rem;font-size:.9rem;color:var(--muted)}nav a{text-decoration:none}",
  ".hero{display:grid;gap:2rem;border-bottom:1px solid var(--rule);padding:2.4rem 0}",
  "@media(min-width:800px){.hero{grid-template-columns:1.15fr .85fr;align-items:end}}",
  ".hero h1{font-size:clamp(2.4rem,6vw,3.6rem);line-height:.95;margin:0}.hero p{color:var(--muted);max-width:28rem}",
  ".meta{display:flex;flex-wrap:wrap;gap:1rem;color:var(--muted);font-size:.9rem}",
  ".search{border:1px solid var(--rule);background:var(--card);padding:1rem}",
  ".search label{display:block;font-size:.75rem;letter-spacing:.14em;text-transform:uppercase;color:var(--muted);margin-bottom:.5rem}",
  ".search input{width:100%;border:0;border-bottom:1px solid var(--rule);background:transparent;font:inherit;padding:.4rem 0}",
  ".chips{display:flex;flex-wrap:wrap;gap:.4rem;margin-top:.8rem}",
  ".chip{border:1px solid var(--rule);padding:.2rem .55rem;font-size:.8rem;text-decoration:none;background:var(--paper2)}",
  ".row{display:grid;grid-template-columns:auto 1fr;gap:.9rem;padding:1.1rem 0;border-bottom:1px solid var(--rule);text-decoration:none}",
  ".mark{width:2rem;height:2rem;display:grid;place-items:center;color:#fffaf2;font-weight:700}",
  ".kicker{font-size:.72rem;letter-spacing:.14em;text-transform:uppercase;color:var(--muted)}",
  ".headline{font-size:1.35rem;margin:.2rem 0}.dek{color:var(--muted)}",
  "article{max-width:36rem;margin:0 auto;padding:2rem 0}",
  ".source{margin-top:1.4rem;padding-top:1rem;border-top:1px solid var(--rule)}.source a{color:var(--accent)}",
  "a.row[hidden]{display:none}",
].join("");

function shell(title, body, extra) {
  return [
    "<!doctype html><html lang=en><head><meta charset=utf-8>",
    "<meta name=viewport content='width=device-width, initial-scale=1'>",
    "<title>", esc(title), "</title>",
    "<meta name=description content='Official AI-lab briefs, dated and sourced.'>",
    "<link rel=icon href=/favicon.svg><link rel=stylesheet href=/styles.css>",
    extra || "",
    "</head><body><div class=wrap><header>",
    "<a class=brand href=/>Lab Ledger<span class=desk>Desk</span></a>",
    "<nav><a href=/>Today</a><a href=/method/>Method</a><a href=", CHANNEL, " rel=noreferrer>Channel</a></nav>",
    "</header>", body,
    "<footer><p>Lab Ledger records official lab posts. It does not invent launches.</p><a href=/method/>How the desk works</a></footer>",
    "</div><script>",
    "(function(){var q=document.getElementById('q');if(!q)return;var rows=[].slice.call(document.querySelectorAll('.row'));function apply(){var n=(q.value||'').trim().toLowerCase();rows.forEach(function(r){r.hidden=n.length>0&&r.textContent.toLowerCase().indexOf(n)<0;});}q.addEventListener('input',apply);var p=new URLSearchParams(location.search).get('q');if(p){q.value=p;apply();}})();",
    "</script></body></html>",
  ].join("");
}

function rowHtml(b) {
  return [
    "<a class=row href=", JSON.stringify(b.path), ">",
    "<div class=mark style=background:", b.color, ">", esc(b.mark), "</div><div>",
    "<div class=kicker>", esc(b.lab), " · ", esc(b.dateLabel), "</div>",
    "<div class=headline>", esc(b.headline), "</div>",
    "<div class=dek>", esc(b.dek), "</div></div></a>",
  ].join("");
}

async function write(path, content) {
  const full = join(OUT, path);
  await mkdir(dirname(full), { recursive: true });
  await writeFile(full, content);
}

async function telegram(posts) {
  const token = (process.env.TELEGRAM_BOT_TOKEN || "").trim();
  const chat = (process.env.TELEGRAM_CHAT_ID || "").trim();
  if (!token || !chat || !posts.length) return;
  for (const post of posts) {
    const text = post.headline + "\n" + SITE + post.path;
    try {
      await fetch("https://api.telegram.org/bot" + token + "/sendMessage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chat, text, disable_web_page_preview: true }),
        signal: AbortSignal.timeout(10000),
      });
    } catch {}
  }
}

const packs = await Promise.all(
  LABS.filter((l) => l.feed).map(async (lab) => {
    try {
      const xml = await fetchFeed(lab.feed);
      const items = parseFeed(xml).filter((item) => lab.hosts.includes(hostOf(item.link) || "")).slice(0, 8);
      return { lab, items };
    } catch {
      return { lab, items: [] };
    }
  }),
);

const briefs = [];
const used = new Set();
for (let i = 0; i < 8; i += 1) {
  for (const pack of packs) {
    if (briefs.length >= 10) break;
    const item = pack.items[i];
    if (!item || used.has(item.link)) continue;
    used.add(item.link);
    const { year, month, day } = ymd(item.publishedAt);
    const slug = slugify(item.title);
    const path = "/b/" + year + "/" + month + "/" + day + "/" + slug + "/";
    const headline = item.title;
    const dek = item.summary.slice(0, 220) || ("Official " + pack.lab.label + " publication logged by the desk.");
    briefs.push({
      lab: pack.lab.label, labId: pack.lab.id, mark: pack.lab.mark, color: pack.lab.color,
      headline, dek,
      what: item.summary || (pack.lab.label + " published " + headline + "."),
      why: "This page is a dated register of an official " + pack.lab.label + " post. Claims stay inside the source.",
      source: item.link, year, month, day, slug, path,
      dateLabel: year + "-" + month + "-" + day, publishedAt: item.publishedAt,
    });
  }
}

const today = new Date().toISOString().slice(0, 10);
const fresh = briefs.filter((b) => Date.now() - b.publishedAt.getTime() < 6 * 60 * 60 * 1000);
await mkdir(OUT, { recursive: true });
await write("styles.css", CSS);
await write("favicon.svg", '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" fill="#1c1914"/><path fill="#f4efe4" d="M9 6h7v14h8v6H9z"/><rect x="9" y="27.5" width="14" height="1.5" fill="#6e2f22"/></svg>');
await write("robots.txt", "User-agent: *\nAllow: /\nSitemap: " + SITE + "/sitemap.xml\n");
await write("llms.txt", "# Lab Ledger\n\nPublic register of official AI-lab announcements.\nCanonical host: " + SITE + "\n");
const chipBar = LABS.map((l) => "<a class=chip href=/lab/" + l.id + "/>" + esc(l.label) + "</a>").join("");
const board = briefs.map(rowHtml).join("") || "<p class=dek>Desk is waiting on the next official post.</p>";
await write("index.html", shell("Lab Ledger", [
  "<section class=hero><div><h1>What the labs moved. Sourced, dated, kept.</h1>",
  "<p>A public ledger of official announcements from the model makers. One brief per move, with the primary source on the page.</p>",
  "<div class=meta><span>Desk date <strong>", esc(today), "</strong></span><span>Open briefs <strong>", String(briefs.length), "</strong></span></div></div>",
  "<form class=search action=/ method=get><label for=q>Look up a lab or a move</label>",
  "<input id=q name=q placeholder='Anthropic, Gemini, weights'><div class=chips>", chipBar, "</div></form></section><section>", board, "</section>",
].join("")));
await write("method/index.html", shell("Method — Lab Ledger", "<article><p class=kicker>Method</p><h1>How the desk works</h1><p>The desk reads official RSS from named labs, writes a brief in a fixed template, and files it by date. It does not invent launches or rewrite the claim.</p><p>Sources stay on the page. Telegram carries the same brief after the site file is written.</p></article>"));
await write("404.html", shell("Not found — Lab Ledger", "<article><p class=kicker>404</p><h1>This brief is not on the ledger.</h1><p class=dek>The desk only files official lab posts it has already read.</p><p><a href=/>Back to today</a></p></article>"));
for (const lab of LABS) {
  const rows = briefs.filter((b) => b.labId === lab.id);
  await write("lab/" + lab.id + "/index.html", shell(lab.label + " — Lab Ledger", [
    "<article><p class=kicker>", esc(lab.label), "</p><h1>", esc(lab.label), " archive</h1></article><section>",
    rows.map(rowHtml).join("") || ("<p class=dek>No filed brief for " + esc(lab.label) + " yet.</p>"),
    "</section>",
  ].join("")));
}
for (const b of briefs) {
  const jsonLd = JSON.stringify({ "@context": "https://schema.org", "@type": "NewsArticle", headline: b.headline, datePublished: b.publishedAt.toISOString(), description: b.dek, author: { "@type": "Organization", name: "Lab Ledger" }, citation: b.source });
  await write("b/" + b.year + "/" + b.month + "/" + b.day + "/" + b.slug + "/index.html", shell(b.headline + " — Lab Ledger", [
    "<article><div class=mark style=background:", b.color, ">", esc(b.mark), "</div>",
    "<p class=kicker>", esc(b.lab), " · ", esc(b.dateLabel), "</p><h1>", esc(b.headline), "</h1>",
    "<p class=dek>", esc(b.dek), "</p><h2 class=kicker>What moved</h2><p>", esc(b.what), "</p>",
    "<h2 class=kicker>Why it matters</h2><p>", esc(b.why), "</p>",
    "<div class=source>Primary source: <a href=", JSON.stringify(b.source), " rel='noreferrer noopener'>", esc(hostOf(b.source) || b.source), "</a></div></article>",
  ].join(""), "<script type='application/ld+json'>" + jsonLd + "</script>"));
}
const urls = ["/", "/method/", ...LABS.map((l) => "/lab/" + l.id + "/"), ...briefs.map((b) => b.path)];
await write("sitemap.xml", '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' + urls.map((u) => "<url><loc>" + SITE + u + "</loc></url>").join("") + "</urlset>");
await write("rss.xml", '<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>Lab Ledger</title><link>' + SITE + "</link><description>Official AI-lab briefs.</description>" + briefs.map((b) => "<item><title>" + esc(b.headline) + "</title><link>" + SITE + b.path + "</link><guid>" + SITE + b.path + "</guid><description>" + esc(b.dek) + "</description><pubDate>" + b.publishedAt.toUTCString() + "</pubDate></item>").join("") + "</channel></rss>");
await telegram(fresh);
console.log("wrote " + briefs.length + " briefs, telegram " + fresh.length);
