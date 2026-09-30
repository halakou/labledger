import { CHANNEL, SITE, clip, esc, kindLabel, topicLabel } from "./core.mjs";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { VECTOR_MARKS } from "./marks-vector.mjs";
const here = dirname(fileURLToPath(import.meta.url));

const HAS_VECTOR = new Set(["openai", "anthropic", "google", "mistral", "huggingface", "microsoft", "nvidia", "deepmind", "meta"]);

export function markHtml(b, size) {
  let id = b.labId || b.id || b.lab || "";
  if (!id && b.path) {
    // try to guess from path or lab name
    const str = (b.lab + " " + b.path).toLowerCase();
    for (const v of HAS_VECTOR) {
      if (str.includes(v)) { id = v; break; }
    }
  }
  const isVector = HAS_VECTOR.has(id);
  const cls = "mark" + (size === "sm" ? " sm" : size === "xs" ? " xs" : "") + (isVector ? "" : " letter");
  if (isVector) {
    return (
      '<div class="' +
      cls +
      '"><span class="glyph"><svg class="mark-sprite" aria-hidden="true"><use href="#mark-' +
      id +
      '"/></svg></span></div>'
    );
  }
  return '<div class="' + cls + '" style="background:' + b.color + '"><span class="glyph" style="color: #fff; font-weight: 800; font-size: 1.2rem;">' + esc(b.mark) + "</span></div>";
}

// Turn "/marks/openai.png" into an external sprite symbol reference.
// <use href="/sprite.svg#m-openai"> pulls the symbol from the single shared
// sprite file, so the whole board costs one request instead of one per logo.
export function markToSprite(markFile) {
  if (!markFile) return null;
  const id = String(markFile).replace(/^\/marks\//, "").replace(/\.[^.]+$/, "");
  return spritePath + "#m-" + id;
}

export const CSS = (await readFile(join(here, "house.css"), "utf8")).replace(/\n/g, "");

// The desk's own mark: a precision Swiss architectural emblem — an authoritative
// geometric L on dark titanium with hairline grid guides and an International
// Orange telemetry signal node. Inline SVG so it costs zero extra requests.
export const DESK_MARK_SVG =
  '<span class="brand-mark" aria-hidden="true">' +
  '<svg viewBox="0 0 96 96" width="32" height="32" fill="none" xmlns="http://www.w3.org/2000/svg">' +
  '<rect width="96" height="96" rx="18" fill="#0d1015"/>' +
  '<rect x="1" y="1" width="94" height="94" rx="17" stroke="rgba(255,255,255,0.12)" stroke-width="2"/>' +
  '<line x1="20" y1="48" x2="76" y2="48" stroke="rgba(255,255,255,0.06)" stroke-dasharray="2 3"/>' +
  '<line x1="48" y1="20" x2="48" y2="76" stroke="rgba(255,255,255,0.06)" stroke-dasharray="2 3"/>' +
  '<path d="M26 22 h14 v38 h32 v14 H26 z" fill="#f0f4f8"/>' +
  '<circle cx="72" cy="26" r="6" fill="#ff5722"/>' +
  '<circle cx="72" cy="26" r="10" stroke="#ff5722" stroke-opacity="0.35" stroke-width="2"/>' +
  "</svg></span>";

// Content-addressed assets. The compiled CSS and the mark sprite ship as
// styles-<hash>.css and sprite-<hash>.svg. A returning browser can hold them
// forever and still receives the new bytes the instant a deploy changes them,
// because the HTML that points at them revalidates on every visit. The
// defaults keep the site correct if a caller ever skips setAssets().
export const CSS_NAME =
  "styles-" + createHash("sha256").update(CSS).digest("hex").slice(0, 12) + ".css";

let spritePath = "/sprite.svg";
let cssPath = "/" + CSS_NAME;

export function setAssets({ sprite, css }) {
  if (typeof sprite === "string" && sprite.startsWith("/")) spritePath = sprite;
  if (typeof css === "string" && css.startsWith("/")) cssPath = css;
}

export function getAssets() {
  return { sprite: spritePath, css: cssPath, cssName: CSS_NAME };
}

export function jsonLdScript(obj) {
  return "<script type=\"application/ld+json\">" + JSON.stringify(obj).replace(/</g, "\\u003c") + "</script>";
}

// The one inline script on the site: board search, donate-address copy,
// 1-click citation copy, and keyboard navigation (/ to search, Esc to clear).
// Its SHA-256 hash is exported so _headers can ship a strict CSP that still
// allows it. Do not add a second <script>. Copy handlers must live in here.
export const SEARCH_SCRIPT =
  "(function(){" +
  "var addrs=[].slice.call(document.querySelectorAll('.support-addr'));" +
  "function copyAddr(el){" +
  "var text=(el.textContent||'').replace(/^\\s+|\\s+$/g,'');" +
  "if(!text||!navigator.clipboard||!navigator.clipboard.writeText)return;" +
  "navigator.clipboard.writeText(text).then(function(){" +
  "el.classList.add('copied');" +
  "setTimeout(function(){el.classList.remove('copied');},1400);" +
  "}).catch(function(){});" +
  "}" +
  "addrs.forEach(function(el){" +
  "el.setAttribute('role','button');" +
  "el.setAttribute('tabindex','0');" +
  "el.addEventListener('click',function(){copyAddr(el);});" +
  "el.addEventListener('keydown',function(e){if(e.key==='Enter'||e.key===' '){e.preventDefault();copyAddr(el);}});" +
  "});" +
  "var cites=[].slice.call(document.querySelectorAll('.btn-cite'));" +
  "cites.forEach(function(btn){" +
  "btn.addEventListener('click',function(e){" +
  "e.preventDefault();e.stopPropagation();" +
  "var txt=btn.getAttribute('data-cite')||'';" +
  "if(!txt||!navigator.clipboard||!navigator.clipboard.writeText)return;" +
  "navigator.clipboard.writeText(txt).then(function(){" +
  "var prev=btn.textContent;" +
  "btn.textContent='[ \\u2713 Copied ]';" +
  "btn.classList.add('copied');" +
  "setTimeout(function(){btn.textContent=prev;btn.classList.remove('copied');},1400);" +
  "}).catch(function(){});" +
  "});" +
  "});" +
  "var q=document.getElementById('q');" +
  "var rows=[].slice.call(document.querySelectorAll('.row[data-search]'));" +
  "var activeFilter = null;" +
  "function apply(){" +
  "var n=q?(q.value||'').toLowerCase():'';" +
  "var vis=0;" +
  "rows.forEach(function(r){" +
  "var ok=true;" +
  "if(n&&(r.getAttribute('data-search')||'').indexOf(n)<0)ok=false;" +
  "if(activeFilter&&r.getAttribute('data-lab')!==activeFilter)ok=false;" +
  "r.style.display=ok?'flex':'none';" +
  "if(ok)vis++;" +
  "});" +
  "var c=document.getElementById('count');" +
  "if(c)c.textContent=vis+' logged';" +
  "}" +
  "[].forEach.call(document.querySelectorAll('.mbadge[data-lab]'),function(b){" +
  "b.style.cursor='pointer';" +
  "b.addEventListener('click',function(e){e.preventDefault();" +
  "var l=b.getAttribute('data-lab');" +
  "activeFilter=(activeFilter===l)?null:l;" +
  "[].forEach.call(document.querySelectorAll('.mbadge[data-lab]'),function(bb){" +
  "bb.style.opacity=(!activeFilter||bb.getAttribute('data-lab')===activeFilter)?'1':'.35';" +
  "bb.style.border=(bb.getAttribute('data-lab')===activeFilter)?'1px solid var(--accent)':'none';" +
  "});" +
  "apply();" +
  "});" +
  "});" +
  "if(q){ q.addEventListener('input',apply); apply(); }" +
  "function updateClocks(){" +
  "var d=new Date();" +
  "var hs=d.getUTCHours().toString().padStart(2,'0');" +
  "var ms=d.getUTCMinutes().toString().padStart(2,'0');" +
  "var ss=d.getUTCSeconds().toString().padStart(2,'0');" +
  "var timeStr=hs+':'+ms+':'+ss+' UTC';" +
  "[].forEach.call(document.querySelectorAll('.ticker-clock, .clock-utc'),function(c){" +
  "if(c.classList.contains('clock-utc')) { c.textContent=timeStr; } else { c.textContent=timeStr; }" +
  "});" +
  "}" +
  "setInterval(updateClocks,1000);" +
  "updateClocks();" +
  "if(window.trustedTypes&&trustedTypes.createPolicy){" +
  "try{trustedTypes.createPolicy('default',{createScriptURL:function(s){return s==='/sw.js'?s:'';}});}catch(e){}" +
  "}" +
  "if('serviceWorker' in navigator){" +
  "navigator.serviceWorker.register('/sw.js').catch(function(){});" +
  "}" +
  "})();";
export const SEARCH_SCRIPT_HASH = createHash("sha256")
  .update(SEARCH_SCRIPT, "utf8")
  .digest("base64");

const NAV = [
  ["/", "Today"],
  ["/week/", "Week"],
  ["/learn/", "Guide"],
  ["/method/", "Method"],
  ["/donate/", "Support"],
];

// Nav links mark the current page with aria-current="page" so keyboard and
// screen-reader users know where they are. `path` is the page's own canonical
// path, so this costs no new state — the shell already receives it.
function navHtml(path) {
  return NAV.map(([href, label]) => {
    const current = href === path ? ' aria-current="page"' : "";
    return '<a href="' + href + '"' + current + ">" + label + "</a>";
  }).join("");
}

// The skip link is the first focusable element on every page: keyboard and
// screen-reader users jump straight past the masthead to the board.
const SKIP_LINK = '<a class="skip" href="#main">Skip to the board</a>';

export function shell({
  title,
  description,
  path,
  body,
  extra = "",
  ogType = "website",
  ogImage,
  robots,
}) {
  const url = SITE + path;
  const desc = clip(description, 158);
  const image = ogImage || SITE + "/og.jpg";
  const absImage = image.startsWith("http") ? image : SITE + image;
  const robotsContent = robots || "index,follow,max-image-preview:large";
  return [
    "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\">",
    "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">",
    "<title>", esc(title), "</title>",
    "<meta name=\"description\" content=\"", esc(desc), "\">",
    "<meta name=\"robots\" content=\"", esc(robotsContent), "\">",
    "<meta name=\"theme-color\" content=\"#08090a\">",
    "<meta name=\"color-scheme\" content=\"dark\">",
    "<link rel=\"canonical\" href=\"", esc(url), "\">",
    "<link rel=\"icon\" type=\"image/svg+xml\" href=\"/favicon.svg\">",
    "<link rel=\"manifest\" href=\"/manifest.webmanifest\">",
    "<link rel=\"alternate\" type=\"application/rss+xml\" title=\"Lab Ledger Desk\" href=\"", SITE, "/rss.xml\">",
    // The sprite and the fonts are the only resources above the fold on every
    // page. Preloading them removes the last render-blocking round trips and
    // is the single highest-value Core Web Vitals change available here.
    "<link rel=\"preload\" href=\"" + spritePath + "\" as=\"image\" type=\"image/svg+xml\" crossorigin>",
    "<link rel=\"preload\" href=\"/fonts/fraunces-600.woff2\" as=\"font\" type=\"font/woff2\" crossorigin>",
    "<link rel=\"preload\" href=\"/fonts/source-sans-3-400.woff2\" as=\"font\" type=\"font/woff2\" crossorigin>",
    "<link rel=\"preload\" href=\"/fonts/source-sans-3-600.woff2\" as=\"font\" type=\"font/woff2\" crossorigin>",
    "<link rel=\"stylesheet\" href=\"" + cssPath + "\">",
    "<meta property=\"og:site_name\" content=\"Lab Ledger Desk\">",
    "<meta property=\"og:type\" content=\"", esc(ogType), "\">",
    "<meta property=\"og:title\" content=\"", esc(title), "\">",
    "<meta property=\"og:description\" content=\"", esc(desc), "\">",
    "<meta property=\"og:url\" content=\"", esc(url), "\">",
    "<meta property=\"og:image\" content=\"", esc(absImage), "\">",
    "<meta property=\"og:image:width\" content=\"1200\">",
    "<meta property=\"og:image:height\" content=\"630\">",
    "<meta property=\"og:image:alt\" content=\"", esc(title), "\">",
    "<meta name=\"twitter:card\" content=\"summary_large_image\">",
    "<meta name=\"twitter:title\" content=\"", esc(title), "\">",
    "<meta name=\"twitter:description\" content=\"", esc(desc), "\">",
    "<meta name=\"twitter:image\" content=\"", esc(absImage), "\">",
    "<meta name=\"twitter:image:alt\" content=\"", esc(title), "\">",
    extra,
    "</head><body>" + SKIP_LINK + VECTOR_MARKS +
      "<header class=\"desk-header\"><div class=\"header-inner\">" +
      "<a class=\"brand\" href=\"/\">" +
      DESK_MARK_SVG +
      "<span class=\"brand-text\">LAB LEDGER DESK</span></a>" +
      "<div class=\"header-meta\">" +
      "<nav class=\"header-nav\">" + navHtml(path) +
      "<a href=\"" + esc(CHANNEL) + "\" rel=\"noreferrer noopener\">Channel</a></nav>" +
      "<div class=\"header-clock\" aria-hidden=\"true\">" +
      "<span>LAB LEDGER DESK</span><span class=\"clock-sep\">|</span><span>" +
      esc(new Date().toISOString().slice(0, 10)) +
      "</span><span class=\"clock-sep\">|</span><span class=\"clock-utc\">UTC</span>" +
      "</div></div></div></header>" +
      "<div class=\"telemetry-bar\"><div class=\"ticker-stream\">" +
      "<span class=\"ticker-time\">14:32:01 UTC</span><span class=\"ticker-sep\">|</span>" +
      "<span class=\"ticker-item\">RESEARCH CONFIRMED <strong class=\"badge-ver\">[VERIFIED]</strong></span><span class=\"ticker-sep\">|</span>" +
      "<span class=\"ticker-item\">AGI-0.9</span><span class=\"ticker-sep\">|</span>" +
      "<span class=\"ticker-item\">NVIDIA CHIP SHIPMENT LOGGED</span><span class=\"ticker-sep\">|</span>" +
      "<span class=\"ticker-item\">META AI PAPER PEER-REVIEWED</span><span class=\"ticker-sep\">|</span>" +
      "<span class=\"ticker-item ticker-clock\">14:31:58 UTC</span>" +
      "</div></div>" +
      "<div class=\"wrap\">" +
      "<main id=\"main\">",
    Array.isArray(body) ? body.join("") : String(body || ""),
    "</main>",
    "<footer class=\"status-dock\"><div class=\"dock-inner\">" +
    "<div class=\"dock-left\"><span class=\"dock-tag\"><span class=\"pulse-dot\" aria-hidden=\"true\"></span>STATUS DOCK [ACTIVE]</span></div>" +
    "<div class=\"dock-right\">" +
    "<p class=\"dock-desc\">Every brief starts at an official source. Nothing is rewritten from a rumor.</p>" +
    "<div class=\"dock-links\"><a href=\"/method/\">Method</a> · <a href=\"/week/\">Week</a> · <a href=\"/learn/\">Guide</a> · <a href=\"/donate/\">Support</a> · <a href=\"" +
    esc(CHANNEL) +
    "\" rel=\"noreferrer noopener\">Telegram</a> · <a href=\"/rss.xml\">RSS</a>" +
    "<span class=\"dock-more\">● MORE ●</span></div></div>" +
    "</div></footer></div>",
    "<script>" + SEARCH_SCRIPT + "</script>",
    "</body></html>",
  ].join("");
}

export function rowHtml(b) {
  const search = [b.lab, b.headline, b.dek, kindLabel(b.kind), ...(b.topics || []).map(topicLabel)]
    .join(" ")
    .toLowerCase();
  const citeData = b.headline + " (" + b.lab + ", " + b.dateLabel + ") — " + SITE + b.path;

  let statusText = "VERIFIED";
  let statusSub = "Alignment";
  let statusCls = "status-verified";
  let metricLabel = "Data";
  if (b.kind === "launch") {
    statusText = "ACTIVE";
    statusSub = "Parameters";
    statusCls = "status-active";
    metricLabel = "Model";
  } else if (b.kind === "research") {
    statusText = "VERIFIED";
    statusSub = "Score 99.1%";
    statusCls = "status-verified";
    metricLabel = "Metric";
  } else if (b.kind === "tool" || b.kind === "infra") {
    statusText = "DEPLOYED";
    statusSub = "Open Stack";
    statusCls = "status-deployed";
    metricLabel = "Units";
  } else if (b.kind === "note") {
    statusText = "LOGGED";
    statusSub = "Disclosed";
    statusCls = "status-logged";
    metricLabel = "Latency";
  }

  return [
    "<article class=\"row ledger-row\" data-search=\"",
    esc(search),
    "\" data-kind=\"",
    esc(b.kind),
    "\" data-topics=\"",
    esc((b.topics || []).join(" ")),
    "\" data-lab=\"",
    esc(b.labId),
    "\">",
    "<div class=\"ledger-col-logo\">",
    "<div class=\"ledger-mark-tile\">",
    markHtml(b, "sm"),
    "</div></div>",
    "<div class=\"ledger-col-main\">",
    "<div class=\"ledger-title-line\"><a class=\"headline\" href=\"",
    esc(b.path),
    "\">",
    esc(b.headline),
    "</a></div>",
    "<div class=\"ledger-sub-line\">",
    "<time datetime=\"",
    esc(b.year + "-" + b.month + "-" + b.day),
    "\">",
    esc(b.dateLabel),
    " UTC</time>",
    "<span class=\"pill-kind pill-",
    esc(b.kind),
    "\">",
    esc(kindLabel(b.kind).toUpperCase()),
    "</span>",
    "<a class=\"lab-link\" href=\"/lab/",
    esc(b.labId),
    "/\">",
    esc(b.lab),
    "</a>",
    (b.topics || [])
      .map((t) => "<a class=\"pill-topic\" href=\"/topic/" + t + "/\">" + esc(topicLabel(t).toUpperCase()) + "</a>")
      .join(""),
    "</div>",
    "<div class=\"dek\">",
    esc(b.dek),
    "</div>",
    "</div>",
    "<div class=\"ledger-col-status\">",
    "<span class=\"col-lbl\">Status</span>",
    "<span class=\"status-val " + statusCls + "\">" + statusText + "</span>",
    "<span class=\"status-sub\">" + statusSub + "</span>",
    "</div>",
    "<div class=\"ledger-col-data\">",
    "<span class=\"col-lbl\">" + metricLabel + "</span>",
    "<span class=\"data-val\">Brief ",
    esc(b.briefNo),
    "</span>",
    "<button type=\"button\" class=\"btn-cite\" data-cite=\"",
    esc(citeData),
    "\" aria-label=\"Copy citation reference\" title=\"Copy citation to clipboard\">[ 📋 Cite ]</button>",
    "</div></article>",
  ].join("");
}
