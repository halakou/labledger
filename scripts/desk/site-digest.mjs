import { CHANNEL, LABS, SITE, esc, runLog } from "./core.mjs";
import { formatRange, mondayOf, write } from "./net.mjs";
import { jsonLdScript, rowHtml, shell } from "./render.mjs";

export async function writeDigest({ allBriefs, briefs, today }) {
  const methodFaq = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      {
        "@type": "Question",
        name: "What is Lab Ledger Desk?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "A public register of official AI announcements from named labs, research groups, and MIT Technology Review. Each page is a brief of about 100 words: what moved, why it matters, and the primary source.",
        },
      },
      {
        "@type": "Question",
        name: "How is Anthropic filed without RSS?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Anthropic publishes no RSS. The desk reads https://www.anthropic.com/news over HTTPS, then the article's own og:title and og:description. If that description is Anthropic's site-wide boilerplate, the desk takes the first paragraph of the article instead. It does not use RSSHub or any unofficial proxy.",
        },
      },
      {
        "@type": "Question",
        name: "Does it invent news?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "No. It does not invent launches, rewrite claims, or fetch hosts outside the allow-list.",
        },
      },
      {
        "@type": "Question",
        name: "Is there a newsletter?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "There is no email list. The weekly digest is a public page. Follow the RSS feed or the Telegram channel for the same briefs.",
        },
      },
    ],
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
        "<h2>What this is</h2><p>Lab Ledger Desk is a public register of official AI announcements from named labs, research groups, and MIT Technology Review. Each page is a brief of about 100 words: what moved, why it matters, and the primary source. Labels such as Launch, Research, and Note are keyword tags, not a human editor’s verdict.</p>",
        "<h2>What this is not</h2><p>It is not a newspaper with invented reporters. It does not copy lab posts in full. It does not invent launches. It does not use unofficial RSS proxies. It does not run an email list. Meta and xAI are absent because they publish no official feed the desk will fetch.</p>",
        "<h2>How a brief is made</h2><p>On the hour, the desk reads allow-listed HTTPS sources. Official RSS is the default. Anthropic has no RSS, so the desk reads the official /news listing and then the article’s own og:title and og:description. If that description is Anthropic’s site-wide boilerplate, the first paragraph of the article is used instead. If a feed item arrives with an empty summary — DeepMind often does — the desk fills the summary from that same host’s meta description. Duplicates are dropped by guid. A fixed template is filled to about 100 words. Telegram carries the same brief only after the page exists.</p>",
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
        "<h2>Archive</h2><p>The board shows about twenty to twenty-eight current briefs. The ledger keeps earlier pages so a filed URL stays put. The desk does not rewrite an old brief’s path. Caps at five hundred kept files.</p>",
        "<h2>Marks</h2><p>Each lab sits in a house square. Where an official favicon or a small mark can be fetched from that lab’s own host at build time, it is stored on this site. No third-party logo CDN is called when you read a page. If the host refuses the icon, the house letter stays.</p>",
        "<h2>Tags</h2><p>Launch, Research, and Note are content types. LLM, Hardware, Medical, Safety, Open models, Agents, Science, and Enterprise are topic tags. They are keyword matches against the official title and summary. They are not extra reporting.</p>",
        "<h2>Weekly digest</h2><p>The week page lists this week’s filed briefs. There is no sign-up form and no mailbox. Follow <a href=\"/rss.xml\">RSS</a> or <a href=\"",
        esc(CHANNEL),
        "\" rel=\"noreferrer noopener\">Telegram</a> if you want the same record without opening the site every day.</p>",
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
      body: "<article class=\"method\"><p class=\"kicker\">404</p><h1>This brief is not on the ledger.</h1><p class=\"dek\">The desk only files official lab posts it has already read.</p><p><a class=\"back\" href=\"/\">← Back to the board</a></p></article>",
    }),
  );
  return weekBriefs.length;
}
