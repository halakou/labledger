import { copyFile } from "node:fs/promises";
import { join } from "node:path";
import {
  CHANNEL,
  FONT_DIR,
  KINDS,
  LABS,
  OUT,
  SITE,
  TOPICS,
  clip,
  esc,
} from "./core.mjs";
import { OPEN_PROJECTS } from "./config.mjs";
import { copyOg, exists, write } from "./net.mjs";
import { CSS, CSS_NAME, getAssets, jsonLdScript, markHtml, markToSprite, rowHtml, shell,
  SEARCH_SCRIPT_HASH,
} from "./render.mjs";
import { GUIDE_ENTRIES } from "./learn.mjs";

// The homepage shows a capped slice of the board. The full ledger lives at
// /week/ and /lab/<id>/ — the homepage is a front page, not an archive.
export const HOME_MAX = 20;

// The FAQ ships in English: the board's content is filed from English-language
// official sources, so the page stays one language end to end. {tg} becomes a
// link to the channel in the visible page and a plain word in JSON-LD.
export const HOME_FAQ = [
  {
    h: "What does the desk file?",
    p: "Official announcements from named labs and research groups — plus the open-source releases that move the stack underneath them. One brief per move, about 100 words. The primary source stays on the page.",
  },
  {
    h: "Which sources are on the board?",
    p: "Every source below is read straight from the publisher's own feed or release page. No wire service, no aggregator, no screenshot.",
  },
  {
    h: "Does the desk invent launches?",
    p: "No. It reads allow-listed official sources, fills a fixed template, and mirrors the same brief to {tg} after the page exists. There is no email list — use RSS or the weekly digest.",
  },
];

export async function writeStatic(fontNames) {
  await write(CSS_NAME, CSS);
  for (const name of fontNames) {
    const src = join(FONT_DIR, name);
    if (await exists(src)) await copyFile(src, join(OUT, "fonts", name));
  }
  // Marks live in one SVG sprite now — one request for the whole board
  // instead of one request per logo. Individual mark files are no longer
  // copied to OUT.
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
  await write(
    "desk-status.json",
    JSON.stringify({
      ok: true,
      builtAt: new Date().toISOString(),
      service: "labledger-desk",
    }),
  );
  await write(
    "robots.txt",
    [
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
    ].join("\n"),
  );
  // Web app manifest: the site is installable and gets a proper name/icon in
  // the app switcher instead of a generic browser tile. Icons point at the
  // self-hosted favicon and OG image — no third-party CDN, per the CSP.
  await write(
    "manifest.webmanifest",
    JSON.stringify({
      name: "Lab Ledger Desk",
      short_name: "Lab Ledger",
      description:
        "A public ledger of official AI-lab announcements, dated and sourced.",
      start_url: "/",
      scope: "/",
      display: "standalone",
      background_color: "#08090a",
      theme_color: "#08090a",
      icons: [
        { src: "/favicon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
        { src: "/og.jpg", sizes: "1200x630", type: "image/jpeg", purpose: "any" },
      ],
    }),
  );
  // Minimal service worker: stale-while-revalidate for HTML so a returning
  // reader gets the board instantly and the fresh copy a moment later;
  // cache-first for the content-addressed assets (sprite-<hash>.svg,
  // styles-<hash>.css, fonts) whose names already encode their version.
  // Registered from the site's one inline script, so CSP stays intact.
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
      "- " + SITE + "/ — today's board",
      "- " + SITE + "/week/ — weekly digest",
      "- " + SITE + "/method/ — how the desk works",
      "- " + SITE + "/rss.xml — machine feed",
      "- " + SITE + "/sitemap.xml",
      "- " + SITE + "/open/ — open-source releases board",
      "- " + SITE + "/learn/ — field guide: original AI explainers",
      ...GUIDE_ENTRIES.map((g) => "- " + SITE + "/learn/" + g.slug + "/ — " + g.title),
      "- " + SITE + "/donate/ — support and cost ledger",
      ...LABS.map((l) => "- " + SITE + "/lab/" + l.id + "/ — " + l.label + " archive"),
      ...OPEN_PROJECTS.map((p) => "- " + SITE + "/lab/" + p.id + "/ — " + p.label + " archive"),
      ...TOPICS.map((t) => "- " + SITE + "/topic/" + t.id + "/ — " + t.label),
      ...KINDS.map((k) => "- " + SITE + "/kind/" + k.id + "/ — " + k.label),
      "",
      "## Latest briefs",
      ...briefs.slice(0, 20).map((b) => "- " + b.dateLabel + " · " + b.lab + " · " + b.headline + " — " + SITE + b.path),
      "",
    ].join("\n"),
  );
  const a = getAssets();
  await write(
    "_headers",
    [
      "/*",
      "  Content-Security-Policy: default-src 'none'; script-src 'self' 'sha256-" + SEARCH_SCRIPT_HASH + "'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; manifest-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'none'; frame-ancestors 'none'; trusted-types default; require-trusted-types-for 'script'",
      "  X-Content-Type-Options: nosniff",
      "  Referrer-Policy: strict-origin-when-cross-origin",
      "  X-Frame-Options: DENY",
      "  Permissions-Policy: camera=(), microphone=(), geolocation=()",
      "  Strict-Transport-Security: max-age=31536000; includeSubDomains; preload",
      // Cross-origin isolation: every subresource is self-hosted, so
      // same-origin/require-corp is safe and unlocks cross-origin features
      // (SharedArrayBuffer) if a future page needs them.
      "  Cross-Origin-Opener-Policy: same-origin",
      "  Cross-Origin-Embedder-Policy: require-corp",
      "  Cross-Origin-Resource-Policy: same-origin",
      // HTML revalidates on every visit (the board moves every ~15 minutes),
      // but a returning reader is served the cached page instantly and gets
      // the fresh copy on the next navigation instead of waiting on the
      // network for a 200 that carries the same bytes.
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
      // The sprite and the compiled CSS ship under content-addressed names
      // (sprite-<hash>.svg, styles-<hash>.css) and the HTML pointing at them
      // revalidates on every visit, so these are immutable: the name changes
      // the instant the bytes do. An unhashed fallback keeps the old safe
      // short-lived rule instead of ever freezing a stale logo.
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
      "/404.html",
      "  X-Robots-Tag: noindex",
      "",
    ].join("\n"),
  );
}

function chips(items, hrefBase) {
  return items
    .map(
      (item) =>
        '<a class="chip" href="' +
        hrefBase +
        item.id +
        '/" data-chip="' +
        esc(item.id) +
        '">' +
        esc(item.label) +
        '<span class="chip-n"></span></a>',
    )
    .join("");
}

// Mini mark row for the hero: the board's labs as tiny live tiles, using the
// same sprite so they cost no extra requests. Counts are filled in client-side
// from the data-* attributes on the rows below.
function markRow(labs) {
  return (
    '<div class="markrow" aria-hidden="true">' +
    labs
      .map(
        (l) =>
          '<a class="mbadge" href="/lab/' +
          esc(l.id) +
          '/" data-lab="' +
          esc(l.id) +
          '" title="' +
          esc(l.label) +
          '">' +
          markHtml(l, "xs", markToSprite(l.markFile)) +
          '<span class="mbadge-n"></span></a>',
      )
      .join("") +
    "</div>"
  );
}

export async function writeHome({ allBriefs, briefs, openBriefs = [], today }) {
  // The homepage is a front page, not the whole archive: a capped slice of
  // the board, with the rest reachable from /week/ and each lab's archive.
  const shown = briefs.slice(0, HOME_MAX);
  const openShown = openBriefs.slice(0, HOME_MAX);
  const board = shown.map(rowHtml).join("") || "<p class=\"empty\">Desk is waiting on the next official post.</p>";

  // Trending frontiers for the left column (matching the reference console)
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
        dek: latest.dek,
        path: latest.path,
      });
    }
  }

  const labGrid = LABS.map((l) => {
    const how = l.listing && !l.feed ? "Official listing" : l.feed ? "Official RSS" : "No official source";
    return "<a href=\"/lab/" + l.id + "/\"><b>" + esc(l.label) + "</b><span>" + how + "</span></a>";
  }).join("");
  const faq = HOME_FAQ;
  // The {tg} marker becomes a link in the visible page; in JSON-LD it is a
  // plain word, since structured data carries no markup.
  const faqPlain = faq.map((item) => ({
    h: item.h,
    p: item.p.replace("{tg}", "Telegram"),
  }));
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
        itemListElement: shown.map((b, i) => ({
          "@type": "ListItem",
          position: i + 1,
          url: SITE + b.path,
          name: b.headline,
        })),
      },
      {
        "@type": "FAQPage",
        mainEntity: faqPlain.map((item) => ({
          "@type": "Question",
          name: item.h,
          acceptedAnswer: { "@type": "Answer", text: item.p },
        })),
      },
    ],
  };
  await write(
    "index.html",
    shell({
      title: "Lab Ledger Desk — Primary moves from the labs",
      description:
        "Official AI announcements from named labs, research groups, and the press that covers them — plus open-source release notes. Dated, sourced, kept.",
      path: "/",
      extra: jsonLdScript(homeSchema),
      body: [
        "<div class=\"dashboard-grid\">",
        // LEFT COLUMN: TRENDING FRONTIERS
        "<aside class=\"frontiers-col\">",
        "<div class=\"panel-hdr\"><h2 class=\"panel-title\">TRENDING FRONTIERS</h2></div>",
        "<div class=\"frontiers-list\">",
        trendingFrontiers
          .map(
            (f) =>
              "<div class=\"frontier-card\">" +
              "<a class=\"frontier-name\" href=\"/lab/" +
              esc(f.id) +
              "/\">" +
              esc(f.label) +
              "</a>" +
              "<a class=\"frontier-headline\" href=\"" +
              esc(f.path) +
              "\">" +
              esc(f.headline) +
              "</a>" +
              "<div class=\"frontier-dek\">" +
              esc(clip(f.dek, 140)) +
              "</div>" +
              "</div>",
          )
          .join(""),
        "</div>",
        "<div class=\"frontiers-sources-box\"><h3 class=\"mini-hdr\">27 MONITORED LABS</h3>" +
        "<div class=\"labs-mini-grid\">" +
        labGrid +
        "</div></div>",
        "</aside>",
        // RIGHT COLUMN: ACTIVITY LEDGER
        "<section class=\"ledger-col\" id=\"today\">",
        "<div class=\"panel-hdr\">",
        "<h2 class=\"panel-title\">ACTIVITY LEDGER</h2>",
        "<span id=\"count\" class=\"panel-badge\">" + String(shown.length) + " LOGGED</span>",
        "</div>",
        "<form class=\"search-bar\" action=\"/\" method=\"get\" role=\"search\">",
        "<div class=\"search-box\"><input id=\"q\" name=\"q\" type=\"search\" placeholder=\"Search by lab, model, topic, or release…\" autocomplete=\"off\"><span class=\"search-kbd\">/</span></div>",
        "<div class=\"chips\" data-group=\"kind\">" + chips(KINDS, "/kind/") + "</div>",
        "<div class=\"chips\" data-group=\"topic\">" + chips(TOPICS, "/topic/") + "</div>",
        "</form>",
        markRow([...LABS, ...OPEN_PROJECTS]),
        "<div class=\"ledger-feed\">",
        board,
        "</div>",
        "</section>",
        "</div>",
        openShown.length
          ? [
              "<section class=\"open-rail-section\" id=\"open\">",
              "<div class=\"panel-hdr\"><h2 class=\"panel-title\">OPEN INFRASTRUCTURE RAIL</h2><span class=\"panel-badge\">" +
                String(openShown.length) +
                " FILED</span></div>",
              "<div class=\"ledger-feed\">" + openShown.map(rowHtml).join("") + "</div>",
              "</section>",
            ].join("")
          : "",
        "<article class=\"method\">",
        "<h2>" + esc(faq[0].h) + "</h2><p>" + esc(faq[0].p) + "</p>",
        "<h2>" + esc(faq[1].h) + "</h2><p>" + esc(faq[1].p) + "</p>",
        // The full source table lives once, at /method/. Duplicating it here
        // made the homepage a third of its current weight for no reader value.
        "<p><a class=\"support-cta\" href=\"/method/\">How the desk works →</a></p>",
        "<h2>" + esc(faq[2].h) + "</h2><p>" +
          esc(faq[2].p).replace(
            "{tg}",
            "<a href=\"" + esc(CHANNEL) + "\" rel=\"noreferrer noopener\">Telegram</a>",
          ) +
          "</p>",
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
      title: "Open releases — Lab Ledger Desk",
      description:
        "Official release notes from open-source AI projects: vLLM, SGLang, Ollama, Transformers, ComfyUI, DeepSpeed, JAX, PyTorch. Dated, sourced, kept.",
      path: "/open/",
      extra: jsonLdScript({
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        name: "Open releases — Lab Ledger Desk",
        url: SITE + "/open/",
        dateModified: today,
        publisher: { "@type": "NewsMediaOrganization", name: "Lab Ledger Desk", url: SITE + "/" },
        mainEntity: {
          "@type": "ItemList",
          name: "Open-source AI releases",
          numberOfItems: openBriefs.length,
          itemListElement: openBriefs.slice(0, 40).map((b, i) => ({
            "@type": "ListItem",
            position: i + 1,
            url: SITE + b.path,
            name: b.headline,
          })),
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
