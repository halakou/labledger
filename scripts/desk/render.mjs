import { CHANNEL, SITE, clip, esc, kindLabel, topicLabel } from "./core.mjs";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const here = dirname(fileURLToPath(import.meta.url));

export function markHtml(b, size) {
  const cls = "mark" + (size === "sm" ? " sm" : "") + (b.markFile ? "" : " letter");
  if (b.markFile) {
    return (
      '<div class="' +
      cls +
      '" style="background:' +
      b.color +
      '"><span class="glyph"><img src="' +
      esc(b.markFile) +
      '" alt="" width="38" height="38"></span></div>'
    );
  }
  return '<div class="' + cls + '" style="background:' + b.color + '">' + esc(b.mark) + "</div>";
}

export const CSS = (await readFile(join(here, "house.css"), "utf8")).replace(/\n/g, "");

export function jsonLdScript(obj) {
  return "<script type=\"application/ld+json\">" + JSON.stringify(obj).replace(/</g, "\\u003c") + "</script>";
}

export function shell({ title, description, path, body, extra = "", ogType = "website" }) {
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
    "<nav><a href=\"/\">Today</a><a href=\"/week/\">Week</a><a href=\"/method/\">Method</a>",
    "<a href=\"", esc(CHANNEL), "\" rel=\"noreferrer noopener\">Channel</a></nav>",
    "</header>",
    body,
    "<footer><p>Lab Ledger Desk records official lab posts. It does not invent launches.</p>",
    "<p><a href=\"/method/\">How the desk works</a> · <a href=\"/week/\">Weekly digest</a> · <a href=\"",
    esc(CHANNEL),
    "\" rel=\"noreferrer noopener\">Telegram</a> · <a href=\"/rss.xml\">RSS</a></p>",
    "</footer></div>",
    "<script>(function(){var q=document.getElementById('q');var rows=[].slice.call(document.querySelectorAll('.row[data-search]'));if(!rows.length)return;var state={kind:'',topic:'',lab:''};function norm(s){return (s||'').toLowerCase();}function apply(){var n=norm(q&&q.value);var vis=0;rows.forEach(function(r){var ok=true;if(n&&(r.getAttribute('data-search')||'').indexOf(n)<0)ok=false;if(state.kind&&r.getAttribute('data-kind')!==state.kind)ok=false;if(state.topic&&(r.getAttribute('data-topics')||'').indexOf(state.topic)<0)ok=false;if(state.lab&&r.getAttribute('data-lab')!==state.lab)ok=false;r.hidden=!ok;if(ok)vis++;});var c=document.getElementById('count');if(c)c.textContent=vis+' logged';}if(q)q.addEventListener('input',apply);document.querySelectorAll('[data-filter]').forEach(function(btn){btn.addEventListener('click',function(e){e.preventDefault();var key=btn.getAttribute('data-filter');var val=btn.getAttribute('data-value');state[key]=state[key]===val?'':val;document.querySelectorAll('[data-filter=\"'+key+'\"]').forEach(function(b){b.removeAttribute('aria-current');});if(state[key])btn.setAttribute('aria-current','page');apply();});});var p=new URLSearchParams(location.search);if(q&&p.get('q'))q.value=p.get('q');['kind','topic','lab'].forEach(function(key){if(p.get(key))state[key]=p.get(key);});document.querySelectorAll('[data-filter]').forEach(function(btn){var key=btn.getAttribute('data-filter');if(state[key]===btn.getAttribute('data-value'))btn.setAttribute('aria-current','page');});apply();})();</script>",
    "</body></html>",
  ].join("");
}

export function rowHtml(b) {
  const search = [b.lab, b.headline, b.dek, kindLabel(b.kind), ...(b.topics || []).map(topicLabel)]
    .join(" ")
    .toLowerCase();
  return [
    "<a class=\"row\" href=\"",
    esc(b.path),
    "\" data-search=\"",
    esc(search),
    "\" data-kind=\"",
    esc(b.kind),
    "\" data-topics=\"",
    esc((b.topics || []).join(" ")),
    "\" data-lab=\"",
    esc(b.labId),
    "\">",
    markHtml(b, "md"),
    "<div>",
    "<div class=\"kicker\">",
    esc(b.lab),
    " · ",
    esc(b.dateLabel),
    "</div>",
    "<div class=\"headline\">",
    esc(b.headline),
    "</div>",
    "<div class=\"dek\">",
    esc(b.dek),
    "</div>",
    "<div class=\"row-meta\"><span class=\"kind\">",
    esc(kindLabel(b.kind)),
    "</span>",
    (b.topics || [])
      .map((t) => "<span class=\"tag\">" + esc(topicLabel(t)) + "</span>")
      .join(""),
    "<span>",
    esc(b.lab),
    "</span><span>",
    esc(b.dateLabel),
    "</span></div>",
    "</div><div class=\"row-id\">Brief ",
    esc(b.briefNo),
    "</div></a>",
  ].join("");
}
