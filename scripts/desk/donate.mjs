import { CHANNEL, OUT, SITE, runLog } from "./core.mjs";
import { write } from "./net.mjs";
import { jsonLdScript, shell } from "./render.mjs";

// What this page is: the cost ledger of keeping the desk honest.
// Published openly so support is grounded in real numbers, not guilt.
const COSTS = [
  { label: "Cloudflare Pages bandwidth", note: "served free, till the free tier", amount: "0" },
  { label: "GitHub Actions minutes", note: "free tier covers the daily runs", amount: "0" },
  { label: "Worker + KV heartbeat", note: "free tier, one cron per 5 min", amount: "0" },
  { label: "News intake (17 labs)", note: "official feeds, no wire service", amount: "0" },
  { label: "Human review of every brief", note: "sourcing, dating, dedupe — the real cost", amount: "time" },
];

const WAYS = [
  {
    title: "Send a note",
    body: "Tell us which lab we should add, or which brief got a date wrong. A correction is worth more than a coffee, and it costs you nothing.",
    href: CHANNEL,
    cta: "Open the channel",
    kind: "free",
  },
  {
    title: "Share a brief",
    body: "Forward one dated brief to someone who still reads AI news from screenshots. That is how a desk like this grows.",
    href: "/",
    cta: "Pick a brief",
    kind: "free",
  },
  {
    title: "Star the method",
    body: "The whole pipeline is open source. A star tells the next reader that a human looked at this and did not laugh.",
    href: "https://github.com/halakou/labledger",
    cta: "See the source",
    kind: "free",
  },
];

export async function writeDonate({ today, briefsCount = 0, openCount = 0, labsCount = 0 }) {
  const totalBriefs = briefsCount;
  await write(
    "donate/index.html",
    shell({
      title: "Keep the desk honest — Lab Ledger Desk",
      description:
        "Lab Ledger Desk runs on free tiers. Support comes as corrections, shares, and stars — not paywalls. Here is the real cost ledger.",
      path: "/donate/",
      extra: jsonLdScript({
        "@context": "https://schema.org",
        "@type": "DonatePage",
        name: "Keep the desk honest",
        url: SITE + "/donate/",
        publisher: { "@type": "NewsMediaOrganization", name: "Lab Ledger Desk", url: SITE + "/" },
        dateModified: today,
      }),
      body: [
        "<article class=\"method\">",
        "<p class=\"kicker\">Support</p>",
        "<h1>Keep the desk honest</h1>",
        "<p class=\"dek\">Every brief you read here was fetched from an official lab feed, dated, sourced, and checked against a duplicate ledger. No invented launches, no breathless rewrites, no unnamed sources. That discipline is the only thing the desk sells — and it is free.</p>",

        "<h2>What it actually costs</h2>",
        "<p class=\"dek\">A news desk that anyone can audit should publish its own costs. Here they are, in full:</p>",
        "<table><thead><tr><th>Line</th><th>Note</th><th>Cost</th></tr></thead><tbody>",
        COSTS.map(
          (c) =>
            "<tr><td>" + c.label + "</td><td>" + c.note + "</td><td>" + c.amount + "</td></tr>",
        ).join(""),
        "</tbody></table>",
        "<p class=\"dek\">The infrastructure is zero. The review is not — and it is done by one person who started this because AI news had become a game of telephone. If the desk has saved you an hour this month, that is the number that matters.</p>",

        "<h2>How to help</h2>",
        "<p class=\"dek\">Three ways, ranked by how much they actually keep the desk alive:</p>",
        WAYS.map(
          (w) =>
            "<section class=\"support-way\"><h3>" +
            w.title +
            "</h3><p>" +
            w.body +
            "</p>" +
            "<a class=\"support-cta\" href=\"" +
            w.href +
            "\" rel=\"noreferrer noopener\">" +
            w.cta +
            " →</a></section>",
        ).join(""),

        "<h2>The ledger so far</h2>",
        "<p class=\"dek\">As of " + today + ", the desk has filed and sourced:</p>",
        "<table><tbody>",
        "<tr><td>Briefs logged</td><td>" + totalBriefs + "</td></tr>",
        "<tr><td>Open-source releases tracked</td><td>" + openCount + "</td></tr>",
        "<tr><td>Labs on the board</td><td>" + labsCount + "</td></tr>",
        "<tr><td>Servers we rent</td><td>0</td></tr>",
        "<tr><td>Paywalls</td><td>0</td></tr>",
        "</tbody></table>",

        "<p class=\"dek\">If you want to fund the time — the review hours, not the servers — the channel has the details. But the three things above cost you nothing, and two of them improve the desk more than money would.</p>",
        "</article>",
      ].join(""),
    }),
  );
}
