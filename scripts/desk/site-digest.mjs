import { CHANNEL, LABS, SITE, esc, runLog } from "./core.mjs";
import { formatRange, mondayOf, write } from "./net.mjs";
import { jsonLdScript, rowHtml, shell } from "./render.mjs";

export const METHOD_SECTIONS = [
  {
    h: "What this is",
    p: "Lab Ledger Desk is a public register of official AI announcements from named labs, research groups, and the press that covers them. Each page is a brief of about 100 words: what moved, why it matters, and the primary source. Labels such as Launch, Research, and Note are keyword tags, not a human editor\u2019s verdict.",
  },
  {
    h: "What this is not",
    p: "It is not a newspaper with invented reporters. It does not copy lab posts in full. It does not invent launches. It does not use unofficial RSS proxies. It does not run an email list. Meta and xAI are absent because they publish no official feed the desk will fetch.",
  },
  {
    h: "How a brief is made",
    p: "About every fifteen minutes, the desk reads allow-listed HTTPS sources. Official RSS is the default. Anthropic has no RSS, so the desk reads the official /news listing and then the article\u2019s own og:title and og:description. If that description is Anthropic\u2019s site-wide boilerplate, the first paragraph of the article is used instead. If a feed item arrives with an empty summary \u2014 DeepMind often does \u2014 the desk fills the summary from that same host\u2019s meta description. Duplicates are dropped by guid. A fixed template is filled to about 100 words. Telegram carries the same brief only after the page exists.",
  },
  {
    h: "Archive",
    p: "The board shows about twenty to twenty-eight current briefs. The ledger keeps earlier pages so a filed URL stays put. The desk does not rewrite an old brief\u2019s path. Caps at five hundred kept files.",
  },
  {
    h: "Marks",
    p: "Each lab sits in a house square. Where an official favicon or a small mark can be fetched from that lab\u2019s own host at build time, it is stored on this site. No third-party logo CDN is called when you read a page. If the host refuses the icon, the house letter stays.",
  },
  {
    h: "Tags",
    p: "Launch, Research, and Note are content types. LLM, Hardware, Medical, Safety, Open models, Agents, Science, and Enterprise are topic tags. They are keyword matches against the official title and summary. They are not extra reporting.",
  },
  {
    h: "Language",
    p: "The desk publishes in English only. Every brief, tag, and page is written in English and the document language is declared as English, so screen readers and search engines never guess. There is no Persian or right-to-left edition yet; if one arrives it will be a separate route with its own language declaration, not a toggle.",
  },
  {
    h: "Weekly digest",
    p: "The week page lists this week\u2019s filed briefs. There is no sign-up form and no mailbox. Follow RSS or Telegram if you want the same record without opening the site every day.",
  },
];

function methodSection(s) {
  if (s.h === "Weekly digest") {
    return (
      "<h2>" +
      esc(s.h) +
      "</h2><p>The week page lists this week\u2019s filed briefs. There is no sign-up form and no mailbox. Follow <a href=\"/rss.xml\">RSS</a> or <a href=\"" +
      esc(CHANNEL) +
      "\" rel=\"noreferrer noopener\">Telegram</a> if you want the same record without opening the site every day.</p>"
    );
  }
  return "<h2>" + esc(s.h) + "</h2><p>" + esc(s.p) + "</p>";
}

export async function writeDigest({ allBriefs, briefs, today }) {
  const methodFaq = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: METHOD_SECTIONS.map((s) => ({
      "@type": "Question",
      name: s.h,
      acceptedAnswer: { "@type": "Answer", text: s.p },
    })),
  };
  await write(
    "method/index.html",
    shell({
      title: "Method — Lab Ledger Desk",
      description:
        "How Lab Ledger Desk reads official lab RSS and Anthropic's official news listing, files a brief, keeps old URLs, and mirrors to Telegram after the page exists.",
      path: "/method/",
      extra: jsonLdScript(methodFaq),
      body: [
        "<article class=\"method\"><p class=\"kicker\">Method</p><h1>How the desk works</h1>",
        METHOD_SECTIONS.slice(0, 3).map(methodSection).join(""),
        "<h2>Sources on this desk date</h2>",
        "<table><thead><tr><th>Lab</th><th>Method</th><th>Host</th></tr></thead><tbody>",
        LABS.map((l) => {
          const method = l.listing && !l.feed ? "Official listing" : l.feed ? "Official RSS" : "Not fetched";
          const host = l.hosts[0] || "—";
          return (
            "<tr><td><a href=\"/lab/" +
            l.id +
            "/\">" +
            esc(l.label) +
            "</a></td><td>" +
            method +
            "</td><td>" +
            esc(host) +
            "</td></tr>"
          );
        }).join(""),
        "</tbody></table>",
        "<h2>This run</h2><ul>",
        runLog.map((line) => "<li>" + esc(line) + "</li>").join("") || "<li>No source log.</li>",
        "</ul>",
        "<p>Desk date <time datetime=\"",
        esc(today),
        "\">",
        esc(today),
        "</time>. Open board ",
        String(briefs.length),
        ". Ledger kept ",
        String(allBriefs.length),
        " briefs so old URLs do not 404.</p>",
        METHOD_SECTIONS.slice(3).map(methodSection).join(""),
        "<h2>Channel</h2><p>The public desk channel is <a href=\"",
        esc(CHANNEL),
        "\" rel=\"noreferrer noopener\">",
        esc(CHANNEL),
        "</a>.</p></article>",
      ].join(""),
    }),
  );

  const weekStart = mondayOf(new Date());
  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);
  const weekBriefs = allBriefs.filter((b) => {
    const t = new Date(b.publishedAt).getTime();
    return t >= weekStart.getTime() && t <= weekEnd.getTime() + 24 * 60 * 60 * 1000 - 1;
  });
  const byDay = new Map();
  for (const b of weekBriefs) {
    const key = b.dateLabel;
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key).push(b);
  }
  const weekRange = formatRange(weekStart, weekEnd);
  await write(
    "week/index.html",
    shell({
      title: "Week of " + weekRange + " — Lab Ledger Desk",
      description: "This week’s official AI-lab briefs, grouped by day. No email list — RSS and Telegram carry the same record.",
      path: "/week/",
      extra: jsonLdScript({
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        name: "Weekly digest — Lab Ledger Desk",
        url: SITE + "/week/",
        dateModified: today,
      }),
      body: [
        "<article class=\"method\"><p class=\"kicker\">Weekly digest</p><h1>Week of ",
        esc(weekRange),
        "</h1>",
        "<p class=\"dek\">The same briefs as the board, grouped by day. Nothing here is emailed. If you want a copy without opening the site, use RSS or Telegram.</p>",
        "<div class=\"subscribe\"><h2>How to follow</h2><p>There is no newsletter form. Subscribe to <a href=\"/rss.xml\">the RSS feed</a> or the <a href=\"",
        esc(CHANNEL),
        "\" rel=\"noreferrer noopener\">Telegram channel</a>. Both carry the filed brief after the page exists.</p></div></article>",
        [...byDay.entries()]
          .map(
            ([day, rows]) =>
              "<section class=\"week-day board\"><h2>" +
              esc(day) +
              "</h2>" +
              rows.map(rowHtml).join("") +
              "</section>",
          )
          .join("") || "<p class=\"empty\">No brief has been filed this week yet.</p>",
      ].join(""),
    }),
  );

  await write(
    "404.html",
    shell({
      title: "Not found — Lab Ledger Desk",
      description: "This brief is not on the ledger.",
      path: "/404.html",
      robots: "noindex, follow",
      body: "<article class=\"method\"><p class=\"kicker\">404</p><h1>This brief is not on the ledger.</h1><p class=\"dek\">The desk only files official lab posts it has already read.</p><p><a class=\"back\" href=\"/\">← Back to the board</a></p></article>",
    }),
  );
  return weekBriefs.length;
}
