import { copyFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CHANNEL,
  FONT_DIR,
  KINDS,
  LABS,
  SITE,
  TOPICS,
  clip,
  esc,
} from "./core.mjs";
import { OPEN_PROJECTS, getOut } from "./config.mjs";
import { copyOg, exists, write } from "./net.mjs";
import { CSS, CSS_NAME, getAssets, jsonLdScript, markHtml, markToSprite, rowHtml, shell,
  SEARCH_SCRIPT_HASH,
  ANALYTICS_HOST,
  ANALYTICS_TOKEN,
} from "./render.mjs";
// C12: read the token through this getter rather than copying it at import
// time, so a token set later in the process (a test, a one-off build) still
// reaches the CSP. render.mjs holds the live binding.
const analyticsToken = () => ANALYTICS_TOKEN;
import { GUIDE_ENTRIES } from "./learn.mjs";

export const HOME_MAX = 20;

// This module lives at scripts/desk/, so the repo's own assets/ dir is two
// levels up. Used for the PWA icons, which are committed rather than fetched.
const here = () => dirname(fileURLToPath(import.meta.url));

export const HOME_FAQ = [
  {
    h: "What does the desk file?",
    p: "Official announcements from named labs and research groups \u2014 plus the open-source releases that move the stack underneath them. One brief per move, about 100 words. The primary source stays on the page.",
  },
  {
    h: "Which sources are on the board?",
    p: "Every source below is read straight from the publisher's own feed or release page. No wire service, no aggregator, no screenshot.",
  },
  {
    h: "Does the desk invent launches?",
    p: "No. It reads allow-listed official sources, fills a fixed template, and mirrors the same brief to {tg} after the page exists. There is no email list \u2014 use RSS or the weekly digest.",
  },
];

export async function writeStatic(fontNames) {
  await write(CSS_NAME, CSS);
  for (const name of fontNames) {
    const src = join(FONT_DIR, name);
    if (await exists(src)) await copyFile(src, join(getOut(), "fonts", name));
  }
  // C18: the manifest needs real square PNGs at 192 and 512, not a 1200x630
  // social image stretched into a rounded icon. They are generated in the repo
  // (see scripts/make-icons.mjs) so nothing is downloaded at build time.
  const repoAssets = join(here(), "..", "..", "assets");
  for (const name of ["icon-192.png", "icon-512.png"]) {
    const iconSrc = join(repoAssets, name);
    if (await exists(iconSrc)) await copyFile(iconSrc, join(getOut(), name));
  }
  await write(
    "favicon.svg",
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" fill="none">' +
      '<rect width="96" height="96" rx="18" fill="#0d1015"/>' +
      '<rect x="1" y="1" width="94" height="94" rx="17" stroke="rgba(255,255,255,0.12)" stroke-width="2"/>' +
      '<path d="M26 22 h14 v38 h32 v14 H26 z" fill="#f0f4f8"/>' +
      '<circle cx="72" cy="26" r="6" fill="#ff5722"/>' +
      '<circle cx="72" cy="26" r="10" stroke="#ff5722" stroke-opacity="0.35" stroke-width="2"/>' +
      "</svg>",
  );
  const ogOk = await copyOg();
  await write("googlece6d31c0feb18c8c.html", "google-site-verification: googlece6d31c0feb18c8c.html");
  await write("desk-status.json", JSON.stringify({ ok: true, builtAt: new Date().toISOString(), service: "labledger-desk", site: SITE, feeds: LABS.length, boards: OPEN_PROJECTS.length }));
  await write(
    "robots.txt",
    ["User-agent: *", "Allow: /", "Sitemap: " + SITE + "/sitemap.xml", "LLMs: " + SITE + "/llms.txt", "", "User-agent: GPTBot", "Allow: /", "User-agent: ChatGPT-User", "Allow: /", "User-agent: PerplexityBot", "Allow: /", "User-agent: Google-Extended", "Allow: /", "User-agent: ClaudeBot", "Allow: /", "User-agent: anthropic-ai", "Allow: /", ""].join("\n"),
  );
  await write(
    "manifest.webmanifest",
    JSON.stringify({
      name: "Lab Ledger Desk",
      short_name: "Lab Ledger",
      description: "A public ledger of official AI-lab announcements, dated and sourced.",
      start_url: "/",
      scope: "/",
      display: "standalone",
      background_color: "#08090a",
      theme_color: "#08090a",
      icons: [
        // C18: the two square PNGs a PWA install prompt actually asks for.
        { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
        { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
        { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        { src: "/favicon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      ],
    }),
  );
  await write(
    "sw.js",
    [
      "const CACHE='desk-v1';",
      "const ASSET=/-[0-9a-f]{12}\\.(css|svg|woff2)$|\\/fonts\\//;",
      "self.addEventListener('install',function(e){self.skipWaiting();e.waitUntil(caches.open(CACHE).then(function(c){return c.add('/');}));});",
      "self.addEventListener('activate',function(e){e.waitUntil(caches.keys().then(function(ks){return Promise.all(ks.filter(function(k){return k!==CACHE;}).map(function(k){return caches.delete(k);}));}).then(function(){return self.clients.claim();}));});",
      "self.addEventListener('fetch',function(e){",
      "var req=e.request;",
      "if(req.method!=='GET')return;",
      "var u=new URL(req.url);",
      "if(u.origin!==self.location.origin)return;",
      "var cached=caches.match(req);",
      "if(ASSET.test(u.pathname)){e.respondWith(cached.then(function(r){return r||fetch(req);}));return;}",
      "var network=fetch(req).then(function(res){if(res&&res.ok&&res.type==='basic'){var copy=res.clone();caches.open(CACHE).then(function(c){c.put(req,copy);});}return res;}).catch(function(){return cached;});",
      "e.respondWith(cached.then(function(r){return r||network;}));",
      "});",
    ].join(""),
  );
  await write(
    ".well-known/security.txt",
    [
      "Contact: mailto:halakouac@gmail.com",
      "Expires: 2027-09-30T00:00:00.000Z",
      "Preferred-Languages: en",
      "Canonical: " + SITE + "/.well-known/security.txt",
      "Policy: https://github.com/halakou/labledger/blob/main/SECURITY.md",
      "",
    ].join("\n"),
  );
  return ogOk;
}

const hashed = (p) => /-[0-9a-f]{12}\.[a-z]+$/i.test(p);

export async function writeLlms(briefs, openBriefs = []) {
  await write(
    "llms.txt",
    [
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
      "## Method in one line",
      "Allow-listed official RSS, plus Anthropic's official /news listing and article Open Graph tags. Empty RSS summaries are filled from the same host's meta description. Old brief URLs stay on the ledger.",
      "",
      "## Pages",
      "- " + SITE + "/ \u2014 today's board",
      "- " + SITE + "/week/ \u2014 weekly digest",
      "- " + SITE + "/method/ \u2014 how the desk works",
      "- " + SITE + "/rss.xml \u2014 machine feed",
      "- " + SITE + "/sitemap.xml",
      "- " + SITE + "/open/ \u2014 open-source releases board",
      "- " + SITE + "/learn/ \u2014 field guide: original AI explainers",
      ...GUIDE_ENTRIES.map((g) => "- " + SITE + "/learn/" + g.slug + "/ \u2014 " + g.title),
      "- " + SITE + "/donate/ \u2014 support and cost ledger",
      "- " + SITE + "/terms/ \u2014 house policy and removal requests",
      ...LABS.map((l) => "- " + SITE + "/lab/" + l.id + "/ \u2014 " + l.label + " archive"),
      ...OPEN_PROJECTS.map((p) => "- " + SITE + "/lab/" + p.id + "/ \u2014 " + p.label + " archive"),
      ...TOPICS.map((t) => "- " + SITE + "/topic/" + t.id + "/ \u2014 " + t.label),
      ...KINDS.map((k) => "- " + SITE + "/kind/" + k.id + "/ \u2014 " + k.label),
      "",
      "## Latest briefs",
      ...briefs.slice(0, 20).map((b) => "- " + b.dateLabel + " \u00b7 " + b.lab + " \u00b7 " + b.headline + " \u2014 " + SITE + b.path),
      "",
    ].join("\n"),
  );
  await write(
    "feed.json",
    JSON.stringify({
      version: "https://jsonfeed.org/version/1.1",
      title: "Lab Ledger Desk",
      home_page_url: SITE + "/",
      feed_url: SITE + "/feed.json",
      description: "Official AI-lab briefs. Named sources only.",
      items: briefs.slice(0, 40).map((b) => ({
        id: SITE + b.path,
        url: SITE + b.path,
        title: b.headline,
        content_text: [b.what, b.why, "Primary source: " + b.source].filter(Boolean).join(" "),
        date_published: b.publishedAt,
        authors: [{ name: b.lab }],
        tags: [b.kind, ...(b.topics || [])],
        external_url: b.source,
      })),
    }),
  );
  const a = getAssets();
  await write(
    "_headers",
    [
      "/*",
      "  Content-Security-Policy: default-src 'none'; script-src 'self' 'sha256-" + SEARCH_SCRIPT_HASH + "'" + (analyticsToken() ? " " + ANALYTICS_HOST : "") + "; style-src 'self' 'unsafe-inline'; img-src 'self' data: " + (analyticsToken() ? ANALYTICS_HOST + " data:" : "") + "; font-src 'self'; manifest-src 'self'; connect-src 'self'" + (analyticsToken() ? " " + ANALYTICS_HOST : "") + "; object-src 'none'; base-uri 'self'; form-action 'none'; frame-ancestors 'none'; trusted-types default; require-trusted-types-for 'script'",
      "  X-Content-Type-Options: nosniff",
      "  Referrer-Policy: strict-origin-when-cross-origin",
      "  X-Frame-Options: DENY",
      "  Permissions-Policy: accelerometer=(), autoplay=(), camera=(), display-capture=(), encrypted-media=(), fullscreen=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), midi=(), payment=(), picture-in-picture=(), publickey-credentials-get=(), screen-wake-lock=(), sync-xhr=(), usb=(), web-share=(), xr-spatial-tracking=(), interest-cohort=()",
      "  X-Permitted-Cross-Domain-Policies: none",
      "  Strict-Transport-Security: max-age=31536000; includeSubDomains; preload",
      "  Cross-Origin-Opener-Policy: same-origin",
      "  Cross-Origin-Embedder-Policy: require-corp",
      "  Cross-Origin-Resource-Policy: same-origin",
      // C24: Cloudflare Pages answers every response with
      // Access-Control-Allow-Origin: * by default, including the static assets
      // here. Nothing on the desk is read cross-origin — the CSP has no
      // foreign origin in any directive — so an open ACAO only widens the
      // audience of the assets for no benefit. An explicit same-origin value
      // overrides the platform default instead of leaving it to platform
      // behaviour. Cloudflare honours an ACAO set in _headers over its own.
      "  Access-Control-Allow-Origin: same-origin",
      "  Cache-Control: public, max-age=0, must-revalidate, stale-while-revalidate=86400",
      "",
      "/og.jpg",
      "  Cache-Control: public, max-age=86400",
      "/og/*",
      "  Cache-Control: public, max-age=86400",
      "/manifest.webmanifest",
      "  Cache-Control: public, max-age=86400, must-revalidate",
      "/sw.js",
      "  Cache-Control: public, max-age=0, must-revalidate",
      "/fonts/*",
      "  Cache-Control: public, max-age=31536000, immutable",
      a.sprite,
      "  Cache-Control: public, max-age=" + (hashed(a.sprite) ? "31536000, immutable" : "86400, must-revalidate"),
      a.css,
      "  Cache-Control: public, max-age=" + (hashed(a.css) ? "31536000, immutable" : "86400, must-revalidate"),
      "/marks/*",
      "  Cache-Control: public, max-age=86400",
      "/googlece6d31c0feb18c8c.html",
      "  Content-Type: text/html; charset=utf-8",
      "  X-Robots-Tag: noindex",
      "/googlece6d31c0feb18c8c",
      "  Content-Type: text/html; charset=utf-8",
      "  X-Robots-Tag: noindex",
      "/desk-status.json",
      "  Content-Type: application/json; charset=utf-8",
      "  Cache-Control: public, max-age=60, must-revalidate",
      "/feed.json",
      "  Content-Type: application/feed+json; charset=utf-8",
      "  Cache-Control: public, max-age=300, must-revalidate",
      "/.well-known/security.txt",
      "  Content-Type: text/plain; charset=utf-8",
      "  Cache-Control: public, max-age=86400",
      "/404.html",
      "  X-Robots-Tag: noindex",
      "",
    ].join("\n"),
  );
}

function kindChips(items) {
  return items.map((item) => '<button type="button" class="chip" data-kind="' + esc(item.id) + '">' + esc(item.label) + "</button>").join("");
}

function topicChips(items) {
  return items.map((item) => '<a class="chip chip-link" href="/topic/' + esc(item.id) + '/">' + esc(item.label) + "</a>").join("");
}

function markRow(labs) {
  return (
    '<div class="markrow">' +
    labs.map((l) => '<a class="mbadge" href="/lab/' + esc(l.id) + '/" data-lab="' + esc(l.id) + '" title="' + esc(l.label) + '">' + markHtml(l, "xs", markToSprite(l.markFile)) + '<span class="mbadge-label">' + esc(l.label) + "</span></a>").join("") +
    "</div>"
  );
}

export async function writeHome({ allBriefs, briefs, openBriefs = [], today }) {
  const shown = briefs.slice(0, HOME_MAX);
  const openShown = openBriefs.slice(0, HOME_MAX);
  const board = shown.map(rowHtml).join("") || "<p class=\"empty\">Desk is waiting on the next official post.</p>";
  const frontierDefs = [
    { id: "openai", label: "OpenAI" },
    { id: "anthropic", label: "Anthropic" },
    { id: "google", label: "Google" },
    { id: "deepmind", label: "DeepMind" },
    { id: "nvidia", label: "NVIDIA" },
    { id: "mistral", label: "Mistral" },
    { id: "microsoft", label: "Microsoft AI" },
  ];
  const trendingFrontiers = [];
  for (const f of frontierDefs) {
    const latest = allBriefs.find((b) => b.labId === f.id);
    if (latest) {
      trendingFrontiers.push({
        id: f.id,
        label: f.label,
        headline: latest.headline,
        dateLabel: latest.dateLabel,
        path: latest.path,
        lab: LABS.find((l) => l.id === f.id) || latest,
      });
    }
  }
  const sourceIndex =
    '<div class="source-index">' +
    '<p class="source-counts"><span><b>' + LABS.length + '</b> FEEDS</span><span class="ticker-sep">\u00b7</span><span><b>' +
    OPEN_PROJECTS.length + '</b> RELEASE BOARDS</span></p>' +
    '<p class="source-links"><a href="/method/">View all feeds</a><a href="/open/">Browse boards</a></p>' +
    "</div>";
  const faq = HOME_FAQ;
  const faqPlain = faq.map((item) => ({ h: item.h, p: item.p.replace("{tg}", "Telegram") }));
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
        potentialAction: { "@type": "SearchAction", target: SITE + "/?q={search_term_string}", "query-input": "required name=search_term_string" },
      },
      {
        "@type": "NewsMediaOrganization",
        "@id": SITE + "/#org",
        name: "Lab Ledger Desk",
        url: SITE + "/",
        logo: SITE + "/og.jpg",
        sameAs: [CHANNEL],
        publishingPrinciples: SITE + "/method/",
        dateModified: today + "T00:00:00Z",
      },
      {
        "@type": "ItemList",
        "@id": SITE + "/#board",
        name: "Today's board",
        numberOfItems: shown.length,
        itemListOrder: "https://schema.org/ItemListOrderDescending",
        itemListElement: shown.map((b, i) => ({ "@type": "ListItem", position: i + 1, url: SITE + b.path, name: b.headline })),
      },
      {
        "@type": "FAQPage",
        mainEntity: faqPlain.map((item) => ({ "@type": "Question", name: item.h, acceptedAnswer: { "@type": "Answer", text: item.p } })),
      },
    ],
  };
  await write(
    "index.html",
    shell({
      title: "Lab Ledger Desk \u2014 Primary moves from the labs",
      description: "Official AI announcements from named labs, research groups, and the press that covers them \u2014 plus open-source release notes. Dated, sourced, kept.",
      path: "/",
      extra: jsonLdScript(homeSchema),
      ticker: shown.slice(0, 4).map((b) => ({ lab: b.lab, headline: b.headline, path: b.path })),
      body: [
        "<div class=\"dashboard-grid\">",
        "<aside class=\"frontiers-col\">",
        "<div class=\"panel-hdr\"><h2 class=\"panel-title\">Trending frontiers</h2></div>",
        "<div class=\"frontiers-list\">",
        trendingFrontiers.map((f) => "<a class=\"frontier-card\" href=\"" + esc(f.path) + "\"><span class=\"frontier-mark\">" + markHtml(f.lab, "sm", markToSprite(f.lab.markFile)) + "</span><span class=\"frontier-body\"><span class=\"frontier-name\">" + esc(f.label) + "</span><time class=\"frontier-date\" datetime=\"" + esc(f.dateLabel) + "\">" + esc(f.dateLabel) + " UTC</time><span class=\"frontier-headline\">" + esc(f.headline) + "</span></span></a>").join(""),
        "</div>",
        sourceIndex,
        "</aside>",
        "<section class=\"ledger-col\" id=\"today\">",
        "<div class=\"panel-hdr\">",
        "<h1 class=\"board-h1\">Lab Ledger Desk</h1>",
        "<span id=\"count\" class=\"panel-badge\">" + String(shown.length) + " LOGGED</span>",
        "<div class=\"chips chips-kind\" data-group=\"kind\">" + kindChips(KINDS) + "</div>",
        "</div>",
        "<form class=\"search-bar\" action=\"/\" method=\"get\" role=\"search\">",
        "<div class=\"search-tools\">",
        "<div class=\"search-box\"><label for=\"q\" class=\"sr-only\">Search the ledger</label><input id=\"q\" name=\"q\" type=\"search\" placeholder=\"Search ledger\u2026\" autocomplete=\"off\" enterkeyhint=\"search\"><span class=\"search-kbd\" aria-hidden=\"true\">/</span></div>",
        markRow([...LABS, ...OPEN_PROJECTS]),
        "</div>",
        "<div class=\"chips\" data-group=\"topic\">" + topicChips(TOPICS) + "</div>",
        "</form>",
        "<div class=\"ledger-feed\">",
        board,
        "</div>",
        "</section>",
        "</div>",
        openShown.length ? ["<section class=\"open-rail-section\" id=\"open\">", "<div class=\"panel-hdr\"><h2 class=\"panel-title\">OPEN INFRASTRUCTURE RAIL</h2><span class=\"panel-badge\">" + String(openShown.length) + " FILED</span></div>", "<div class=\"ledger-feed\">" + openShown.map(rowHtml).join("") + "</div>", "</section>"].join("") : "",
        "<article class=\"method\">",
        "<h2>" + esc(faq[0].h) + "</h2><p>" + esc(faq[0].p) + "</p>",
        "<h2>" + esc(faq[1].h) + "</h2><p>" + esc(faq[1].p) + "</p>",
        "<p><a class=\"support-cta\" href=\"/method/\">How the desk works \u2192</a></p>",
        "<h2>" + esc(faq[2].h) + "</h2><p>" + esc(faq[2].p).replace("{tg}", "<a href=\"" + esc(CHANNEL) + "\" rel=\"noreferrer noopener\">Telegram</a>") + "</p>",
        "</article>",
      ].join(""),
    }),
  );
}

export async function writeOpenBoard({ openBriefs, today }) {
  if (!openBriefs.length) return;
  await write(
    "open/index.html",
    shell({
      title: "Open releases \u2014 Lab Ledger Desk",
      description: "Official release notes from open-source AI projects: vLLM, SGLang, Ollama, Transformers, ComfyUI, DeepSpeed, JAX, PyTorch. Dated, sourced, kept.",
      path: "/open/",
      extra: jsonLdScript({
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        name: "Open releases \u2014 Lab Ledger Desk",
        url: SITE + "/open/",
        dateModified: today,
        publisher: { "@type": "NewsMediaOrganization", name: "Lab Ledger Desk", url: SITE + "/" },
        mainEntity: {
          "@type": "ItemList",
          name: "Open-source AI releases",
          numberOfItems: openBriefs.length,
          itemListElement: openBriefs.slice(0, 40).map((b, i) => ({ "@type": "ListItem", position: i + 1, url: SITE + b.path, name: b.headline })),
        },
      }),
      body: [
        "<article class=\"method\"><p class=\"kicker\">Open rail</p><h1>Open releases</h1>",
        "<p class=\"dek\">Official release notes from open-source AI infrastructure projects. Each entry links to the project's own release page. Nothing here is invented.</p></article>",
        "<section class=\"board\">",
        openBriefs.map(rowHtml).join(""),
        "</section>",
      ].join(""),
    }),
  );
}
