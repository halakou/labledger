import { CHANNEL, SITE, clip, esc, kindLabel, topicLabel } from "./core.mjs";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { VECTOR_MARKS } from "./marks-vector.mjs";
const here = dirname(fileURLToPath(import.meta.url));

const HAS_VECTOR = new Set([
  "openai", "anthropic", "google", "mistral", "huggingface", "microsoft", "nvidia", "deepmind", "meta",
  "aws", "apple", "gresearch", "bair", "mit", "mittr", "wired", "techcrunch", "msftai", "theverge",
  "pytorch", "vllm", "sglang", "ollama", "transformers", "comfyui", "deepspeed", "langchain", "jax",
]);

export function markHtml(b, size, spriteHref) {
  let id = b.labId || b.id || "";
  if (!id && b.path) {
    const str = (b.lab + " " + b.path).toLowerCase();
    for (const v of HAS_VECTOR) {
      if (str.includes(v)) { id = v; break; }
    }
  }
  const isVector = HAS_VECTOR.has(id);
  const href = !isVector && (spriteHref || (b.markFile ? markToSprite(b.markFile) : null));
  const cls = "mark mark-" + id + (size === "sm" ? " sm" : size === "xs" ? " xs" : "") + (href || isVector ? "" : " letter");
  if (isVector) {
    return (
      '<div class="' +
      cls +
      '"><span class="glyph"><svg class="mark-sprite" aria-hidden="true"><use href="#mark-' +
      id +
      '"/></svg></span></div>'
    );
  }
  if (href) {
    return (
      '<div class="' +
      cls +
      '"><span class="glyph"><svg class="mark-sprite" aria-hidden="true"><use href="' +
      esc(href) +
      '"/></svg></span></div>'
    );
  }
  return '<div class="' + cls + '" style="background:' + (b.color || "#1c1914") + '"><span class="glyph">' + esc(b.mark || "") + "</span></div>";
}

export function markToSprite(markFile) {
  if (!markFile) return null;
  const id = String(markFile).replace(/^\/marks\//, "").replace(/\.[^.]+$/, "");
  return spritePath + "#m-" + id;
}

export const CSS = (await readFile(join(here, "house.css"), "utf8") + await readFile(join(here, "design1.css"), "utf8")).replace(/\n/g, "");

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

export const CSS_NAME =
  "styles-" + createHash("sha256").update(CSS).digest("hex").slice(0, 12) + ".css";

export let ANALYTICS_TOKEN = String(process.env.CF_ANALYTICS_TOKEN || "").trim();
export const ANALYTICS_HOST = "https://static.cloudflareinsights.com";
// C12: the beacon is opt-in via the CF_ANALYTICS_TOKEN env var, but a build or
// a test needs to be able to set it after import too. ESM named exports are
// live bindings, so a caller that imports ANALYTICS_TOKEN sees this change.
export function setAnalyticsToken(token) {
  ANALYTICS_TOKEN = String(token || "").trim();
}
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
  "var board=document.getElementById('today');" +
  "var rows=[].slice.call((board||document).querySelectorAll('.row[data-search]'));" +
  "var activeFilter = null;" +
  "var kindFilter = null;" +
  "function apply(){" +
  "var n=q?(q.value||'').toLowerCase():'';" +
  "var vis=0;" +
  "rows.forEach(function(r){" +
  "var ok=true;" +
  "if(n&&(r.getAttribute('data-search')||'').indexOf(n)<0)ok=false;" +
  "if(activeFilter&&r.getAttribute('data-lab')!==activeFilter)ok=false;" +
  "if(kindFilter&&r.getAttribute('data-kind')!==kindFilter)ok=false;" +
  "r.style.display=ok?'':'none';" +
  "if(ok)vis++;" +
  "});" +
  "var c=document.getElementById('count');" +
  "if(c)c.textContent=vis+' LOGGED';" +
  "}" +
  "[].forEach.call(document.querySelectorAll('.chip[data-kind]'),function(chip){" +
  "chip.addEventListener('click',function(){" +
  "var k=chip.getAttribute('data-kind');" +
  "kindFilter=(kindFilter===k)?null:k;" +
  "[].forEach.call(document.querySelectorAll('.chip[data-kind]'),function(c){" +
  "if(kindFilter&&c.getAttribute('data-kind')===kindFilter)c.setAttribute('data-active','1');" +
  "else c.removeAttribute('data-active');" +
  "});" +
  "apply();" +
  "});" +
  "});" +
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
  "[].forEach.call(document.querySelectorAll('.clock-utc, .ticker-time'),function(c){c.textContent=timeStr;});" +
  "}" +
  "setInterval(updateClocks,1000);" +
  "updateClocks();" +
  "document.addEventListener('keydown',function(e){" +
  "if(e.key==='/'&&q&&document.activeElement!==q&&!/^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName)){e.preventDefault();q.focus();}" +
  "if(e.key==='Escape'&&q){q.value='';apply();q.blur();}" +
  "});" +
  "if(window.trustedTypes&&trustedTypes.createPolicy){" +
  "try{trustedTypes.createPolicy('default',{createScriptURL:function(s){return s==='/sw.js'?s:'';}});}catch(e){}" +
  "}" +
  "if('serviceWorker' in navigator){" +
  "navigator.serviceWorker.register('/sw.js').catch(function(){});" +
  "}" +
  "var live=document.getElementById('desk-live');" +
  "if(live){" +
  "live.textContent='UNKNOWN';" +
  "fetch('/desk-status.json').then(function(r){return r.json();}).then(function(d){" +
  "if(!d||!d.builtAt){live.textContent='STALE?';return;}" +
  "var mins=Math.max(0,Math.round((Date.now()-Date.parse(d.builtAt))/60000));" +
  "live.textContent=mins<2?'LIVE':mins+' MIN';" +
  "}).catch(function(){live.textContent='OFFLINE';});" +
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

function navHtml(path) {
  return NAV.map(([href, label]) => {
    const current = href === path ? ' aria-current="page"' : "";
    return '<a href="' + href + '"' + current + ">" + label + "</a>";
  }).join("");
}

const SKIP_LINK = '<a class="skip" href="#main">Skip to the board</a>';

function tickerHtml(items) {
  const rows = Array.isArray(items) ? items.filter((item) => item && item.headline && item.path) : [];
  if (!rows.length) {
    return '<span class="ticker-item">Official sources only</span><span class="ticker-sep">\u00b7</span><span class="ticker-item">Nothing invented</span>';
  }
  const track = rows.slice(0, 6).map((item) =>
    '<a class="ticker-item" href="' + esc(item.path) + '"><span class="ticker-lab">' +
    esc(item.lab || "Source") + '</span><span class="ticker-dot">\u00b7</span>' + esc(clip(item.headline, 78)) + '</a>'
  ).join('<span class="ticker-sep">|</span>');
  return '<div class="ticker-track">' + track + '<span class="ticker-sep">|</span>' + track + '</div>';
}

export function shell({
  title, description, path, body, extra = "", ogType = "website", ogImage, robots, ticker = [],
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
    // C11: the sprite is ~60KB of base64 marks, and it is only needed once the
    // body's <use> references paint — never on the critical first render.
    // preload made it block-style-blocking on every navigation, so fetch it
    // with low priority and let the browser cache it for later pages instead.
    "<link rel=\"preload\" href=\"" + spritePath + "\" as=\"image\" type=\"image/svg+xml\" crossorigin fetchpriority=\"low\">",
    // C11: only the two faces the first paint actually needs are preloaded.
    // The 600 weight of Source Sans is used for bold runs further down the
    // page; it loads on demand from the same immutable /fonts/ cache entry.
    "<link rel=\"preload\" href=\"/fonts/fraunces-600.woff2\" as=\"font\" type=\"font/woff2\" crossorigin>",
    "<link rel=\"preload\" href=\"/fonts/source-sans-3-400.woff2\" as=\"font\" type=\"font/woff2\" crossorigin>",
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
    // C12: Cloudflare Web Analytics, the free beacon that needs no script-src
    // entry beyond itself and no cookie. Served only when the site has a
    // public analytics token; without one this is an empty string and the CSP
    // stays as strict as before.
    (ANALYTICS_TOKEN ? "<script defer async src=\"https://static.cloudflareinsights.com/beacon.min.js\" data-cf-beacon='{\"token\":\"" + ANALYTICS_TOKEN + "\",\"spa\":false}'></script>" : ""),
    "</head><body>" + SKIP_LINK + VECTOR_MARKS +
      "<header class=\"desk-header\"><div class=\"header-inner\">" +
      "<a class=\"brand\" href=\"/\">" + DESK_MARK_SVG +
      "<span class=\"brand-text\">LAB LEDGER DESK</span></a>" +
      "<nav class=\"header-nav\">" + navHtml(path) +
      "<a href=\"" + esc(CHANNEL) + "\" rel=\"noreferrer noopener\">Channel</a></nav>" +
      "<div class=\"header-clock\">" +
      "<span class=\"clock-utc\">00:00:00 UTC</span>" +
      "<span class=\"clock-date\">" + esc(new Date().toISOString().slice(0, 10)) + "</span>" +
      "</div></div></header>" +
      "<div class=\"telemetry-bar\"><div class=\"ticker-stream\">" + tickerHtml(ticker) + "</div></div>" +
      "<div class=\"wrap\"><main id=\"main\">",
    Array.isArray(body) ? body.join("") : String(body || ""),
    "</main>",
    "<footer class=\"status-dock\"><div class=\"dock-inner\">" +
    "<div class=\"dock-left\"><span class=\"dock-tag\"><span class=\"pulse-dot\" aria-hidden=\"true\"></span>STATUS DOCK <span class=\"dock-active\">ACTIVE</span> <span id=\"desk-live\" class=\"desk-live\">UNKNOWN</span></span></div>" +
    "<nav class=\"dock-links\" aria-label=\"Desk\"><a href=\"/method/\">Method</a><a href=\"/week/\">Week</a><a href=\"/learn/\">Guide</a><a href=\"/donate/\">Support</a><a href=\"/terms/\">Terms</a><a href=\"" +
    esc(CHANNEL) + "\" rel=\"noreferrer noopener\">Telegram</a><a href=\"/rss.xml\">RSS</a></nav>" +
    "</div></footer></div>" +
    "<nav class=\"mobile-dock\" aria-label=\"Mobile\">" + navHtml(path) + "</nav>",
    "<script>" + SEARCH_SCRIPT + "</script>",
    "</body></html>",
  ].join("");
}

export function rowHtml(b) {
  const search = [b.lab, b.headline, b.dek, kindLabel(b.kind), ...(b.topics || []).map(topicLabel)].join(" ").toLowerCase();
  const citeData = b.headline + " (" + b.lab + ", " + b.dateLabel + ") \u2014 " + SITE + b.path;
  const statusText = kindLabel(b.kind).toUpperCase();
  return [
    "<article class=\"row ledger-row\" data-search=\"", esc(search), "\" data-kind=\"", esc(b.kind),
    "\" data-topics=\"", esc((b.topics || []).join(" ")), "\" data-lab=\"", esc(b.labId), "\">",
    "<div class=\"ledger-col-logo\"><div class=\"ledger-mark-tile\">", markHtml(b, "sm", markToSprite(b.markFile)), "</div></div>",
    "<div class=\"ledger-col-main\">",
    "<div class=\"ledger-title-line\"><a class=\"headline\" href=\"", esc(b.path), "\">", esc(b.headline), "</a></div>",
    "<div class=\"ledger-sub-line\">",
    "<time datetime=\"", esc(b.year + "-" + b.month + "-" + b.day), "\">", esc(b.dateLabel), " UTC</time>",
    "<span class=\"pill-kind pill-", esc(b.kind), "\">", esc(kindLabel(b.kind).toUpperCase()), "</span>",
    "<a class=\"lab-link\" href=\"/lab/", esc(b.labId), "/\">", esc(b.lab), "</a>",
    (b.topics || []).map((t) => "<a class=\"pill-topic\" href=\"/topic/" + t + "/\">" + esc(topicLabel(t).toUpperCase()) + "</a>").join(""),
    "</div><div class=\"dek\">", esc(b.dek), "</div></div>",
    "<div class=\"ledger-col-status\"><span class=\"col-lbl\">Status</span><span class=\"status-val status-" + esc(b.kind) + "\">" + esc(statusText) + "</span></div>",
    "<div class=\"ledger-col-data\"><span class=\"col-lbl\">Brief</span><span class=\"data-val\">", esc(b.briefNo), "</span>",
    "<button type=\"button\" class=\"btn-cite\" data-cite=\"", esc(citeData), "\" aria-label=\"Copy citation\" title=\"Copy citation\">Cite</button>",
    "</div></article>",
  ].join("");
}
