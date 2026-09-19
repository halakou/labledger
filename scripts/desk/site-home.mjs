import { copyFile } from "node:fs/promises";
import { extname, join } from "node:path";
import {
  CHANNEL,
  FONT_DIR,
  KINDS,
  LABS,
  MARK_DIR,
  OUT,
  SITE,
  TOPICS,
  esc,
} from "./core.mjs";
import { copyOg, exists, write } from "./net.mjs";
import { CSS, jsonLdScript, rowHtml, shell } from "./render.mjs";

export async function writeStatic(fontNames) {
  await write("styles.css", CSS);
  for (const name of fontNames) {
    const src = join(FONT_DIR, name);
    if (await exists(src)) await copyFile(src, join(OUT, "fonts", name));
  }
  for (const lab of LABS) {
    if (!lab.markFile) continue;
    const src = join(MARK_DIR, lab.id + extname(lab.markFile));
    if (await exists(src)) await copyFile(src, join(OUT, "marks", lab.id + extname(lab.markFile)));
  }
  await write(
    "favicon.svg",
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" fill="#1c1914"/><path fill="#f4efe4" d="M9 6h7v14h8v6H9z"/><rect x="9" y="27.5" width="14" height="1.5" fill="#6e2f22"/></svg>',
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
  return ogOk;
}

export async function writeLlms(briefs) {
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
      ...LABS.map((l) => "- " + SITE + "/lab/" + l.id + "/ — " + l.label + " archive"),
      ...TOPICS.map((t) => "- " + SITE + "/topic/" + t.id + "/ — " + t.label),
      ...KINDS.map((k) => "- " + SITE + "/kind/" + k.id + "/ — " + k.label),
      "",
      "## Latest briefs",
      ...briefs.slice(0, 20).map((b) => "- " + b.dateLabel + " · " + b.lab + " · " + b.headline + " — " + SITE + b.path),
      "",
    ].join("\n"),
  );
  await write(
    "_headers",
    [
      "/*",
      "  X-Content-Type-Options: nosniff",
      "  Referrer-Policy: strict-origin-when-cross-origin",
      "  X-Frame-Options: DENY",
      "  Permissions-Policy: camera=(), microphone=(), geolocation=()",
      "",
      "/og.jpg",
      "  Cache-Control: public, max-age=86400",
      "/og/*",
      "  Cache-Control: public, max-age=86400",
      "/fonts/*",
      "  Cache-Control: public, max-age=31536000, immutable",
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
        '/">' +
        esc(item.label) +
        "</a>",
    )
    .join("");
}

export async function writeHome({ allBriefs, briefs, today }) {
  const board = briefs.map(rowHtml).join("") || "<p class=\"empty\">Desk is waiting on the next official post.</p>";
  const labGrid = LABS.map((l) => {
    const how = l.listing && !l.feed ? "Official listing" : l.feed ? "Official RSS" : "No official source";
    return "<a href=\"/lab/" + l.id + "/\"><b>" + esc(l.label) + "</b><span>" + how + "</span></a>";
  }).join("");
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
        numberOfItems: briefs.length,
        itemListOrder: "https://schema.org/ItemListOrderDescending",
        itemListElement: briefs.map((b, i) => ({
          "@type": "ListItem",
          position: i + 1,
          url: SITE + b.path,
          name: b.headline,
        })),
      },
      {
        "@type": "FAQPage",
        mainEntity: [
          {
            "@type": "Question",
            name: "What does Lab Ledger Desk file?",
            acceptedAnswer: {
              "@type": "Answer",
              text: "Official announcements from named AI labs, research groups, and MIT Technology Review. One brief per move, about 100 words, with the primary source on the page.",
            },
          },
          {
            "@type": "Question",
            name: "Which sources are on the board?",
            acceptedAnswer: {
              "@type": "Answer",
              text: "OpenAI, Anthropic, Google, DeepMind, Mistral, Hugging Face, Microsoft Research, NVIDIA, AWS, Apple, Google Research, BAIR, MIT News, and MIT Technology Review. Anthropic is read from its official /news listing. Meta and xAI publish no official RSS the desk will use.",
            },
          },
          {
            "@type": "Question",
            name: "Does the desk invent launches?",
            acceptedAnswer: {
              "@type": "Answer",
              text: "No. It files the official claim and keeps the source on the page.",
            },
          },
        ],
      },
    ],
  };
  await write(
    "index.html",
    shell({
      title: "Lab Ledger Desk — Primary moves from the labs",
      description:
        "A public ledger of official AI announcements from named labs, research groups, and MIT Technology Review. Dated, sourced, kept.",
      path: "/",
      extra: jsonLdScript(homeSchema),
      body: [
        "<section class=\"hero\"><div><h1>What the labs moved. Sourced, dated, kept.</h1>",
        "<p>A public ledger of official AI announcements. Named sources only. One brief per move, about 100 words, with the primary source on the page.</p>",
        "<div class=\"meta\"><span>Desk date <strong><time datetime=\"",
        esc(today),
        "\">",
        esc(today),
        "</time></strong></span>",
        "<span>Open briefs <strong>",
        String(briefs.length),
        "</strong></span>",
        "<span>Ledger <strong>",
        String(allBriefs.length),
        "</strong></span></div></div>",
        "<form class=\"search\" action=\"/\" method=\"get\" role=\"search\"><label for=\"q\">Look up a lab, a launch, or a topic</label>",
        "<input id=\"q\" name=\"q\" type=\"search\" placeholder=\"Anthropic, hardware, Claude…\" autocomplete=\"off\">",
        "<div class=\"chips\">",
        chips(KINDS, "/kind/"),
        chips(TOPICS, "/topic/"),
        "</div>",
        "<div class=\"chips\">",
        chips(LABS, "/lab/"),
        "</div></form></section>",
        "<section class=\"board\" id=\"today\"><div class=\"board-head\"><span>The board</span><span id=\"count\">",
        String(briefs.length),
        " logged</span></div>",
        board,
        "<div class=\"labs\">",
        labGrid,
        "</div></section>",
        "<article class=\"method\"><h2>What does the desk file?</h2>",
        "<p>Official announcements from named labs, research groups, and MIT Technology Review. One brief per move, about 100 words. The primary source stays on the page.</p>",
        "<h2>Which sources are on the board?</h2>",
        "<ul>",
        LABS.map((l) => {
          const how = l.listing && !l.feed ? "official /news listing" : l.feed ? "official RSS" : "no official source";
          return "<li><a href=\"/lab/" + l.id + "/\">" + esc(l.label) + "</a> — " + how + "</li>";
        }).join(""),
        "</ul>",
        "<h2>Does the desk invent launches?</h2>",
        "<p>No. It reads allow-listed official sources, fills a fixed template, and mirrors the same brief to <a href=\"",
        esc(CHANNEL),
        "\" rel=\"noreferrer noopener\">Telegram</a> after the page exists. There is no email list — use RSS or the weekly digest.</p>",
        "</article>",
      ].join(""),
    }),
  );
}
