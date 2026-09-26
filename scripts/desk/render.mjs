import { CHANNEL, SITE, clip, esc, kindLabel, topicLabel } from "./core.mjs";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const here = dirname(fileURLToPath(import.meta.url));

export function markHtml(b, size, spriteRef = null) {
  const cls = "mark" + (size === "sm" ? " sm" : size === "xs" ? " xs" : "") + (b.markFile ? "" : " letter");
  if (b.markFile) {
    if (spriteRef) {
      return (
        '<div class="' +
        cls +
        '"><span class="glyph"><svg class="mark-sprite" aria-hidden="true"><use href="' +
        spriteRef +
        '"/></svg></span></div>'
      );
    }
    return (
      '<div class="' +
      cls +
      '" style="background:' +
      b.color +
      '"><span class="glyph"><img src="' +
      esc(b.markFile) +
      '" alt="" width="38" height="38" loading="lazy" decoding="async"></span></div>'
    );
  }
  return '<div class="' + cls + '" style="background:' + b.color + '">' + esc(b.mark) + "</div>";
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

// The one inline script on the site: the board's search filter. Its SHA-256
// hash is exported so _headers can ship a strict CSP that still allows it.
export const SEARCH_SCRIPT = "(function(){var q=document.getElementById('q');var rows=[].slice.call(document.querySelectorAll('.row[data-search]'));if(!rows.length)return;function norm(s){return (s||'').toLowerCase();}function counts(){var k={},t={},l={};rows.forEach(function(r){if(r.hidden)return;var kk=(r.getAttribute('data-kind')||''),tt=(r.getAttribute('data-topics')||'').split(' '),ll=(r.getAttribute('data-lab')||'');if(kk)k[kk]=(k[kk]||0)+1;tt.forEach(function(x){if(x)t[x]=(t[x]||0)+1;});if(ll)l[ll]=(l[ll]||0)+1;});[].forEach.call(document.querySelectorAll('.chip[data-chip]'),function(c){var g=c.parentNode.getAttribute('data-group');var m=g==='kind'?k:(g==='topic'?t:null);var n=m?m[c.getAttribute('data-chip')]||0:0;c.setAttribute('data-count',n);var cn=c.querySelector('.chip-n');if(cn)cn.textContent=n||'';c.setAttribute('data-active',n?'1':'');});[].forEach.call(document.querySelectorAll('.mbadge[data-lab]'),function(b){var n=l[b.getAttribute('data-lab')]||0;var bn=b.querySelector('.mbadge-n');if(bn)bn.textContent=n||'';b.style.opacity=n?'1':'.35';});}function apply(){var n=norm(q&&q.value);var vis=0;rows.forEach(function(r){var ok=true;if(n&&(r.getAttribute('data-search')||'').indexOf(n)<0)ok=false;r.hidden=!ok;if(ok)vis++;});var c=document.getElementById('count');if(c)c.textContent=vis+' logged';counts();}if(q){q.addEventListener('input',apply);var p=new URLSearchParams(location.search);if(p.get('q'))q.value=p.get('q');apply();}})();";
export const SEARCH_SCRIPT_HASH = createHash("sha256")
  .update(SEARCH_SCRIPT, "utf8")
  .digest("base64");

export function shell({ title, description, path, body, extra = "", ogType = "website", ogImage }) {
  const url = SITE + path;
  const desc = clip(description, 158);
  const image = ogImage || SITE + "/og.jpg";
  const absImage = image.startsWith("http") ? image : SITE + image;
  return [
    "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\">",
    "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">",
    "<title>", esc(title), "</title>",
    "<meta name=\"description\" content=\"", esc(desc), "\">",
    "<meta name=\"robots\" content=\"index,follow,max-image-preview:large\">",
    "<meta name=\"theme-color\" content=\"#f4efe4\">",
    "<meta name=\"color-scheme\" content=\"light\">",
    "<link rel=\"canonical\" href=\"", esc(url), "\">",
    "<link rel=\"icon\" type=\"image/svg+xml\" href=\"/favicon.svg\">",
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
    "</head><body><div class=\"wrap\"><header>",
    "<a class=\"brand\" href=\"/\">Lab Ledger<span class=\"desk\">Desk</span></a>",
    "<nav><a href=\"/\">Today</a><a href=\"/week/\">Week</a><a href=\"/learn/\">Guide</a><a href=\"/method/\">Method</a><a href=\"/donate/\">Support</a>",
    "<a href=\"", esc(CHANNEL), "\" rel=\"noreferrer noopener\">Channel</a></nav>",
    "</header>",
    Array.isArray(body) ? body.join("") : String(body || ""),
    "<footer><p>Every brief here starts at an official source. Nothing is rewritten from a rumor.</p>",
    "<p><a href=\"/method/\">How the desk works</a> · <a href=\"/week/\">Weekly digest</a> · <a href=\"/learn/\">Field guide</a> · <a href=\"/donate/\">Support</a> · <a href=\"",
    esc(CHANNEL),
    "\" rel=\"noreferrer noopener\">Telegram</a> · <a href=\"/rss.xml\">RSS</a></p>",
    "</footer></div>",
    "<script>" + SEARCH_SCRIPT + "</script>",
    "</body></html>",
  ].join("");
}

export function rowHtml(b) {
  const search = [b.lab, b.headline, b.dek, kindLabel(b.kind), ...(b.topics || []).map(topicLabel)]
    .join(" ")
    .toLowerCase();
  return [
    "<article class=\"row\" data-search=\"",
    esc(search),
    "\" data-kind=\"",
    esc(b.kind),
    "\" data-topics=\"",
    esc((b.topics || []).join(" ")),
    "\" data-lab=\"",
    esc(b.labId),
    "\">",
    markHtml(b, "md", markToSprite(b.markFile)),
    "<div>",
    "<div class=\"kicker\"><a href=\"/lab/",
    esc(b.labId),
    "/\">",
    esc(b.lab),
    "</a> · <time datetime=\"",
    esc(b.year + "-" + b.month + "-" + b.day),
    "\">",
    esc(b.dateLabel),
    "</time></div>",
    "<a class=\"headline\" href=\"",
    esc(b.path),
    "\">",
    esc(b.headline),
    "</a>",
    "<div class=\"dek\">",
    esc(b.dek),
    "</div>",
    "<div class=\"row-meta\"><a class=\"kind\" href=\"/kind/",
    esc(b.kind),
    "/\">",
    esc(kindLabel(b.kind)),
    "</a>",
    (b.topics || [])
      .map((t) => "<a class=\"tag\" href=\"/topic/" + t + "/\">" + esc(topicLabel(t)) + "</a>")
      .join(""),
    "<a class=\"tag\" href=\"/lab/" + esc(b.labId) + "/\">",
    esc(b.lab),
    "</a><span><time datetime=\"",
    esc(b.year + "-" + b.month + "-" + b.day),
    "\">",
    esc(b.dateLabel),
    "</time></span></div>",
    "</div><div class=\"row-id\">Brief ",
    esc(b.briefNo),
    "</div></article>",
  ].join("");
}
