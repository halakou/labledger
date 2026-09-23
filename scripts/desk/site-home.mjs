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
  esc,
} from "./core.mjs";
import { OPEN_PROJECTS } from "./config.mjs";
import { copyOg, exists, write } from "./net.mjs";
import { CSS, jsonLdScript, markHtml, markToSprite, rowHtml, shell } from "./render.mjs";
import { GUIDE_ENTRIES } from "./learn.mjs";

export async function writeStatic(fontNames) {
  await write("styles.css", CSS);
  for (const name of fontNames) {
    const src = join(FONT_DIR, name);
    if (await exists(src)) await copyFile(src, join(OUT, "fonts", name));
  }
  // Marks live in one SVG sprite now — one request for the whole board
  // instead of one request per logo. Individual mark files are no longer
  // copied to OUT.
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
  await write(
    "_headers",
    [
      "/*",
      "  X-Content-Type-Options: nosniff",
      "  Referrer-Policy: strict-origin-when-cross-origin",
      "  X-Frame-Options: DENY",
      "  Permissions-Policy: camera=(), microphone=(), geolocation=()",
      "  Strict-Transport-Security: max-age=31536000; includeSubDomains; preload",
      "",
      "/og.jpg",
      "  Cache-Control: public, max-age=86400",
      "/og/*",
      "  Cache-Control: public, max-age=86400",
      "/fonts/*",
      "  Cache-Control: public, max-age=31536000, immutable",
      // The sprite and the compiled CSS are content-addressed in practice:
      // a rebuild changes them, but a returning visitor should never refetch
      // a byte-identical copy. A long age with revalidation keeps the hit
      // rate high without ever serving a stale logo after a deploy.
      "/sprite.svg",
      "  Cache-Control: public, max-age=86400, must-revalidate",
      "/styles.css",
      "  Cache-Control: public, max-age=86400, must-revalidate",
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
  const board = briefs.map(rowHtml).join("") || "<p class=\"empty\">Desk is waiting on the next official post.</p>";
  const openBoard = openBriefs.map(rowHtml).join("");
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
              text: "Official announcements from named AI labs and research groups, plus official release notes from open-source AI projects. One brief per move, about 100 words, with the primary source on the page.",
            },
          },
          {
            "@type": "Question",
            name: "Which sources are on the board?",
            acceptedAnswer: {
              "@type": "Answer",
              text: "Allow-listed official feeds and release pages from named labs and open-source projects — read straight from the publisher. No wire service, no aggregator, no screenshot.",
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
        "Official AI announcements from named labs, research groups, and the press that covers them — plus open-source release notes. Dated, sourced, kept.",
      path: "/",
      extra: jsonLdScript(homeSchema),
      body: [
        "<section class=\"hero\"><div><h1>What the labs moved. Sourced, dated, kept.</h1>",
        "<p>Every brief starts at the source — an official feed or release page from a named lab, read directly and dated. Nothing is rewritten from a rumor, nothing is invented, and the primary link sits on every page.</p>",
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
        "<div class=\"chips\" data-group=\"kind\">",
        chips(KINDS, "/kind/"),
        "</div>",
        "<div class=\"chips\" data-group=\"topic\">",
        chips(TOPICS, "/topic/"),
        "</div></form>",
        markRow([...LABS, ...OPEN_PROJECTS]),
        "</section>",
        "<section class=\"board\" id=\"today\"><div class=\"board-head\"><span>The board</span><span id=\"count\">",
        String(briefs.length),
        " logged</span></div>",
        board,
        "<div class=\"labs\">",
        labGrid,
        "</div></section>",
        openBriefs.length
          ? [
              "<section class=\"board\" id=\"open\"><div class=\"board-head\"><span>Open releases</span><span>",
              String(openBriefs.length),
              " filed</span></div>",
              openBriefs.map(rowHtml).join(""),
              "</section>",
            ].join("")
          : "",
        "<article class=\"method\"><h2>What does the desk file?</h2>",
        "<p>Official announcements from named labs and research groups — plus the open-source releases that move the stack underneath them. One brief per move, about 100 words. The primary source stays on the page.</p>",
        "<h2>Which sources are on the board?</h2>",
        "<p>Every source below is read straight from the publisher's own feed or release page. No wire service, no aggregator, no screenshot.</p>",
        "<table><thead><tr><th>Source</th><th>Read from</th></tr></thead><tbody>",
        LABS.map((l) => {
          const how = l.listing && !l.feed ? "official /news listing" : l.feed ? "official RSS" : "no official source";
          return "<tr><td><a href=\"/lab/" + l.id + "/\">" + esc(l.label) + "</a></td><td>" + how + "</td></tr>";
        }).join(""),
        OPEN_PROJECTS.map((p) => {
          const how = p.kind === "github" ? "official GitHub releases" : "official RSS";
          return "<tr><td><a href=\"/lab/" + p.id + "/\">" + esc(p.label) + "</a></td><td>" + how + "</td></tr>";
        }).join(""),
        "</tbody></table>",
        "<h2>Does the desk invent launches?</h2>",
        "<p>No. It reads allow-listed official sources, fills a fixed template, and mirrors the same brief to <a href=\"",
        esc(CHANNEL),
        "\" rel=\"noreferrer noopener\">Telegram</a> after the page exists. There is no email list — use RSS or the weekly digest.</p>",
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
