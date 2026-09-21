import {
  CHANNEL,
  KINDS,
  LABS,
  SITE,
  TOPICS,
  esc,
  factsFor,
  hostOf,
  kindLabel,
  topicLabel,
} from "./core.mjs";
import { write } from "./net.mjs";
import { jsonLdScript, markHtml, markToSprite, rowHtml, shell } from "./render.mjs";

// Inline SVG activity chart for a lab page: one bar per week, built purely
// from the briefs' own dates. No JS, no external assets, no data duplicated —
// it renders the same for every visitor and costs nothing at runtime.
function activityChart(rows, label) {
  if (rows.length < 2) return "";
  // Bucket briefs into ISO weeks (YYYY-Www). Using the ISO week keeps the
  // axis honest across month boundaries.
  const buckets = new Map();
  for (const b of rows) {
    const key = isoWeek(b.year, b.month, b.day);
    buckets.set(key, (buckets.get(key) || 0) + 1);
  }
  // Show the last 12 weeks even when the lab was quiet — empty weeks are
  // informative, and a single bar would not be a chart.
  const allKeys = [...buckets.keys()].sort();
  const window = 12;
  const last = allKeys[allKeys.length - 1];
  const keys = weekRange(last, window);
  const max = Math.max(...keys.map((k) => buckets.get(k) || 0), 1);
  const W = 320;
  const H = 56;
  const barW = Math.max(3, Math.floor((W - 8) / keys.length) - 2);
  const gap = Math.max(1, Math.floor((W - 8 - barW * keys.length) / Math.max(1, keys.length - 1)));
  const total = rows.length;
  const span = keys.length;
  // <title> inside each bar makes the chart screen-reader friendly.
  const bars = keys
    .map((k, i) => {
      const v = buckets.get(k) || 0;
      const h = v === 0 ? 2 : Math.max(3, Math.round((v / max) * (H - 10)));
      const x = 4 + i * (barW + gap);
      const y = H - 4 - h;
      return (
        '<rect x="' + x + '" y="' + y + '" width="' + barW + '" height="' + h +
        '" rx="1" fill="currentColor" opacity="' + (v === 0 ? 0.12 : (0.35 + (v / max) * 0.65).toFixed(2)) +
        '"><title>' + esc(k) + ": " + v + " brief" + (v === 1 ? "" : "s") + "</title></rect>"
      );
    })
    .join("");
  const active = keys.filter((k) => (buckets.get(k) || 0) > 0).length;
  return (
    '<div class="activity"><svg viewBox="0 0 ' + W + " " + H +
    '" width="100%" height="' + H + '" role="img" aria-label="' + esc(label) +
    " activity: " + total + " brief" + (total === 1 ? "" : "s") + " over the last " + span +
    ' weeks">' + bars + "</svg>" +
    '<p class="activity-cap">' + total + " filed · " + active +
    " active week" + (active === 1 ? "" : "s") + " in the last " + window + "</p></div>"
  );
}

// The `window` ISO weeks ending at `last`, inclusive, oldest first.
function weekRange(last, window) {
  const out = [];
  const [yStr, wStr] = last.split("-W");
  let y = Number(yStr);
  let w = Number(wStr);
  for (let i = window - 1; i >= 0; i--) {
    let yy = y;
    let ww = w - i;
    while (ww < 1) {
      yy -= 1;
      ww += weeksInYear(yy);
    }
    while (ww > weeksInYear(yy)) {
      ww -= weeksInYear(yy);
      yy += 1;
    }
    out.push(yy + "-W" + String(ww).padStart(2, "0"));
  }
  return out;
}

// Number of ISO weeks in a year (52 or 53).
function weeksInYear(y) {
  const d = new Date(Date.UTC(y, 11, 28));
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day + 3);
  const first = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const fd = (first.getUTCDay() + 6) % 7;
  first.setUTCDate(first.getUTCDate() - fd + 3);
  return Math.round((d - first) / (7 * 24 * 60 * 60 * 1000)) + 1;
}

// ISO week number for a date given as numeric parts.
function isoWeek(y, m, d) {
  const date = new Date(Date.UTC(y, m - 1, d));
  const day = (date.getUTCDay() + 6) % 7; // Monday = 0
  date.setUTCDate(date.getUTCDate() - day + 3); // Thursday of this week
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const firstDay = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDay + 3);
  const week =
    1 + Math.round((date - firstThursday) / (7 * 24 * 60 * 60 * 1000));
  return date.getUTCFullYear() + "-W" + String(week).padStart(2, "0");
}

export async function writeArchives({ allBriefs, briefs, openBriefs = [], allOpen = [], today }) {
  for (const lab of LABS) {
    const rows = allBriefs.filter((b) => b.labId === lab.id).slice(0, 80);
    const how = lab.listing && !lab.feed ? "Official /news listing, filed as briefs." : lab.feed ? "Official RSS, filed as briefs." : "No official source.";
    await write(
      "lab/" + lab.id + "/index.html",
      shell({
        title: lab.label + " — Lab Ledger Desk",
        description: "Official " + lab.label + " announcements filed by Lab Ledger Desk.",
        path: "/lab/" + lab.id + "/",
        body: [
          "<article class=\"method\"><p class=\"kicker\">Archive</p><h1>",
          esc(lab.label),
          "</h1>",
          "<p class=\"dek\">",
          how,
          "</p>",
          activityChart(rows, lab.label),
          "</article>",
          "<section class=\"board\">",
          rows.map(rowHtml).join("") || "<p class=\"empty\">No filed brief for " + esc(lab.label) + " yet.</p>",
          "</section>",
        ].join(""),
      }),
    );
  }

  for (const topic of TOPICS) {
    const rows = allBriefs.filter((b) => (b.topics || []).includes(topic.id));
    await write(
      "topic/" + topic.id + "/index.html",
      shell({
        title: topic.label + " — Lab Ledger Desk",
        description: "Official AI-lab briefs tagged " + topic.label + " from allow-listed sources.",
        path: "/topic/" + topic.id + "/",
        extra: jsonLdScript({
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "CollectionPage",
              name: topic.label + " — Lab Ledger Desk",
              url: SITE + "/topic/" + topic.id + "/",
              dateModified: today,
              about: topic.label,
              publisher: {
                "@type": "NewsMediaOrganization",
                name: "Lab Ledger Desk",
                url: SITE + "/",
              },
              mainEntity: {
                "@type": "ItemList",
                name: topic.label + " briefs from every lab",
                numberOfItems: rows.length,
                itemListElement: rows.slice(0, 40).map((b, i) => ({
                  "@type": "ListItem",
                  position: i + 1,
                  url: SITE + b.path,
                  name: b.headline,
                })),
              },
            },
          ],
        }),
        body: [
          "<article class=\"method\"><p class=\"kicker\">Topic</p><h1>",
          esc(topic.label),
          "</h1>",
          "<p class=\"dek\">Every filed brief tagged ",
          esc(topic.label),
          " — from every lab on the desk. Keyword tag from the official title and summary.</p></article>",
          "<section class=\"board\">",
          rows.map(rowHtml).join("") || "<p class=\"empty\">No filed brief currently tagged " + esc(topic.label) + ".</p>",
          "</section>",
        ].join(""),
      }),
    );
  }

  for (const kind of KINDS) {
    const rows = allBriefs.filter((b) => b.kind === kind.id);
    await write(
      "kind/" + kind.id + "/index.html",
      shell({
        title: kind.label + " — Lab Ledger Desk",
        description: "Official AI-lab briefs labelled " + kind.label + ".",
        path: "/kind/" + kind.id + "/",
        extra: jsonLdScript({
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "CollectionPage",
              name: kind.label + " — Lab Ledger Desk",
              url: SITE + "/kind/" + kind.id + "/",
              dateModified: today,
              publisher: {
                "@type": "NewsMediaOrganization",
                name: "Lab Ledger Desk",
                url: SITE + "/",
              },
              mainEntity: {
                "@type": "ItemList",
                numberOfItems: rows.length,
                itemListElement: rows.slice(0, 40).map((b, i) => ({
                  "@type": "ListItem",
                  position: i + 1,
                  url: SITE + b.path,
                  name: b.headline,
                })),
              },
            },
          ],
        }),
        body: [
          "<article class=\"method\"><p class=\"kicker\">Type</p><h1>",
          esc(kind.label),
          "</h1>",
          "<p class=\"dek\">Launch, Research, or Note — a keyword label on the official claim, across every lab.</p></article>",
          "<section class=\"board\">",
          rows.map(rowHtml).join("") || "<p class=\"empty\">No filed brief currently labelled " + esc(kind.label) + ".</p>",
          "</section>",
        ].join(""),
      }),
    );
  }

  for (const b of [...allBriefs, ...allOpen]) {
    const factList = factsFor(b);
    const articleUrl = SITE + b.path;
    const ogImg = b.ogImage ? (b.ogImage.startsWith("http") ? b.ogImage : SITE + b.ogImage) : SITE + "/og.jpg";
    const sourceHost = hostOf(b.source);
    const schema = {
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "NewsArticle",
          headline: b.headline,
          description: b.dek,
          datePublished: b.publishedAt,
          dateModified: b.publishedAt,
          mainEntityOfPage: articleUrl,
          articleSection: b.lab,
          keywords: [kindLabel(b.kind), ...(b.topics || []).map(topicLabel)].join(", "),
          image: [ogImg],
          author: { "@type": "Organization", name: b.lab, url: sourceHost ? "https://" + sourceHost + "/" : b.source },
          publisher: {
            "@type": "NewsMediaOrganization",
            name: "Lab Ledger Desk",
            url: SITE + "/",
            logo: { "@type": "ImageObject", url: SITE + "/og.jpg", width: 1200, height: 630 },
            sameAs: [CHANNEL],
            publishingPrinciples: SITE + "/method/",
          },
          isBasedOn: b.source,
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
      ogImage: ogImg,
      extra: [
        "<meta property=\"article:published_time\" content=\"",
        b.publishedAt,
        "\">",
        "<meta property=\"article:section\" content=\"",
        esc(b.lab),
        "\">",
        (b.topics || []).map((t) => "<meta property=\"article:tag\" content=\"" + esc(topicLabel(t)) + "\">").join(""),
        jsonLdScript(schema),
      ].join(""),
      body: [
        "<article class=\"brief\">",
        markHtml(b, "sm", markToSprite(b.markFile)),
        "<p class=\"kicker\"><a href=\"/lab/",
        esc(b.labId),
        "/\">",
        esc(b.lab),
        "</a> · <a href=\"/kind/",
        esc(b.kind),
        "/\">",
        esc(kindLabel(b.kind)),
        "</a> · <time datetime=\"",
        esc(b.year + "-" + b.month + "-" + b.day),
        "\">",
        esc(b.dateLabel),
        "</time></p>",
        "<h1>",
        esc(b.headline),
        "</h1>",
        "<p class=\"dek\">",
        esc(b.dek),
        "</p>",
        (b.topics || []).length
          ? "<div class=\"row-meta\">" +
            (b.topics || []).map((t) => "<a class=\"tag\" href=\"/topic/" + t + "/\">" + esc(topicLabel(t)) + "</a>").join("") +
            "</div>"
          : "",
        "<section class=\"block\"><h2>What moved</h2><p>",
        esc(b.what),
        "</p></section>",
        "<section class=\"block\"><h2>Why it matters</h2><p>",
        esc(b.why),
        "</p></section>",
        "<section class=\"block\"><h2>On the record</h2><ul>",
        factList.map((f) => "<li>" + esc(f) + "</li>").join(""),
        "</ul></section>",
        "<div class=\"record\"><div><b>Primary source</b><br><a href=\"",
        esc(b.source),
        "\" rel=\"noreferrer noopener\" target=\"_blank\">",
        esc(hostOf(b.source) || b.source),
        "</a></div>",
        "<div><b>Desk</b><br>Logged as brief ",
        esc(b.briefNo),
        "</div></div>",
        "<div class=\"actions\">",
        b.telegramUrl
          ? "<a class=\"tg\" href=\"" + esc(b.telegramUrl) + "\" rel=\"noreferrer noopener\">Open the matching Telegram post</a>"
          : "<a class=\"tg\" href=\"" + esc(CHANNEL) + "\" rel=\"noreferrer noopener\">Follow the desk on Telegram</a>",
        "<a class=\"back\" href=\"/\">\u2190 Back to the board</a></div></article>",
      ].join(""),
    }));
  }

  const urls = [
    ["/", today],
    ["/method/", today],
    ["/week/", today],
    ["/learn/", today],
    ["/learn/ai-vocabulary/", "2026-09-21"],
    ["/donate/", today],
    ["/open/", today],
    ["/open/rss.xml", today],
    ...LABS.map((l) => ["/lab/" + l.id + "/", today]),
    ...TOPICS.map((t) => ["/topic/" + t.id + "/", today]),
    ...KINDS.map((k) => ["/kind/" + k.id + "/", today]),
    ...allBriefs.map((b) => [b.path, b.dateLabel]),
    ...allOpen.map((b) => [b.path, b.dateLabel]),
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
            "</guid><category>" +
            esc(kindLabel(b.kind)) +
            "</category><description>" +
            esc(b.dek) +
            "</description><pubDate>" +
            new Date(b.publishedAt).toUTCString() +
            "</pubDate></item>",
        )
        .join("") +
      "</channel></rss>",
  );
}
