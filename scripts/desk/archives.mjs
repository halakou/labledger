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
import { jsonLdScript, markHtml, rowHtml, shell } from "./render.mjs";

export async function writeArchives({ allBriefs, briefs, today }) {
  for (const lab of LABS) {
    const rows = allBriefs.filter((b) => b.labId === lab.id).slice(0, 80);
    const how = lab.listing && !lab.feed ? "Official /news listing, filed as briefs." : lab.feed ? "Official RSS, filed as briefs." : "No official source.";
    await write(
      "lab/" + lab.id + "/index.html",
      shell({
        title: lab.label + " \u2014 Lab Ledger Desk",
        description: "Official " + lab.label + " announcements filed by Lab Ledger Desk.",
        path: "/lab/" + lab.id + "/",
        body: [
          "<article class=\"method\"><p class=\"kicker\">Archive</p><h1>",
          esc(lab.label),
          "</h1>",
          "<p class=\"dek\">",
          how,
          "</p></article>",
          "<section class=\"board\">",
          rows.map(rowHtml).join("") || "<p class=\"empty\">No filed brief for " + esc(lab.label) + " yet.</p>",
          "</section>",
        ].join(""),
      }),
    );
  }

  for (const topic of TOPICS) {
    const rows = briefs.filter((b) => (b.topics || []).includes(topic.id));
    await write(
      "topic/" + topic.id + "/index.html",
      shell({
        title: topic.label + " \u2014 Lab Ledger Desk",
        description: "Official AI-lab briefs tagged " + topic.label + " from allow-listed sources.",
        path: "/topic/" + topic.id + "/",
        body: [
          "<article class=\"method\"><p class=\"kicker\">Topic</p><h1>",
          esc(topic.label),
          "</h1>",
          "<p class=\"dek\">Keyword tag from the official title and summary. Not extra reporting.</p></article>",
          "<section class=\"board\">",
          rows.map(rowHtml).join("") || "<p class=\"empty\">No open brief currently tagged " + esc(topic.label) + ".</p>",
          "</section>",
        ].join(""),
      }),
    );
  }

  for (const kind of KINDS) {
    const rows = briefs.filter((b) => b.kind === kind.id);
    await write(
      "kind/" + kind.id + "/index.html",
      shell({
        title: kind.label + " \u2014 Lab Ledger Desk",
        description: "Official AI-lab briefs labelled " + kind.label + ".",
        path: "/kind/" + kind.id + "/",
        body: [
          "<article class=\"method\"><p class=\"kicker\">Type</p><h1>",
          esc(kind.label),
          "</h1>",
          "<p class=\"dek\">Launch, Research, or Note \u2014 a keyword label on the official claim.</p></article>",
          "<section class=\"board\">",
          rows.map(rowHtml).join("") || "<p class=\"empty\">No open brief currently labelled " + esc(kind.label) + ".</p>",
          "</section>",
        ].join(""),
      }),
    );
  }

  for (const b of allBriefs) {
    const factList = factsFor(b);
    const articleUrl = SITE + b.path;
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
          image: [SITE + "/og.jpg"],
          author: { "@type": "Organization", name: "Lab Ledger Desk", url: SITE + "/", sameAs: [CHANNEL] },
          publisher: {
            "@type": "Organization",
            name: "Lab Ledger Desk",
            url: SITE + "/",
            logo: { "@type": "ImageObject", url: SITE + "/og.jpg" },
            sameAs: [CHANNEL],
          },
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
      title: b.headline + " \u2014 Lab Ledger Desk",
      description: b.dek,
      path: b.path,
      ogType: "article",
      extra: [
        "<meta property=\"article:published_time\" content=\"",
        b.publishedAt,
        "\">",
        "<meta property=\"article:section\" content=\"",
        esc(b.lab),
        "\">",
        jsonLdScript(schema),
      ].join(""),
      body: [
        "<article class=\"brief\">",
        markHtml(b, "sm"),
        "<p class=\"kicker\">",
        esc(b.lab),
        " \u00b7 ",
        esc(kindLabel(b.kind)),
        " \u00b7 ",
        esc(b.dateLabel),
        "</p>",
        "<h1>",
        esc(b.headline),
        "</h1>",
        "<p class=\"dek\">",
        esc(b.dek),
        "</p>",
        (b.topics || []).length
          ? "<div class=\"row-meta\">" +
            (b.topics || [])
              .map((t) => "<a class=\"tag\" href=\"/topic/" + t + "/\">" + esc(topicLabel(t)) + "</a>")
              .join("") +
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
    ...LABS.map((l) => ["/lab/" + l.id + "/", today]),
    ...TOPICS.map((t) => ["/topic/" + t.id + "/", today]),
    ...KINDS.map((k) => ["/kind/" + k.id + "/", today]),
    ...allBriefs.map((b) => [b.path, b.dateLabel]),
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
