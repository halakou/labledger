// C5: the desk aggregates headlines and excerpts from named labs and projects.
// It keeps a primary-source link on every brief, but an aggregator without a
// public terms-and-removal page has no good-faith path for a publisher who
// wants their feed off the board. This is that path, stated plainly.
//
// Scope note: this is the desk's own house policy, not legal advice, and it
// makes no claim of legal conclusion. It says what the desk does, how to ask,
// and what happens then. Keeping it short and non-assertive is the point — a
// page that overreaches is worse than a page that says plainly what it is.
import { CHANNEL, SITE, esc, runLog } from "./core.mjs";
import { jsonLdScript, shell } from "./render.mjs";
import { write } from "./net.mjs";

// One place both the page and the pipeline point at, so a contact change is
// a single edit. Kept in code (not a build-time constant) on purpose: it is
// the address a takedown request lands on, and it should move with the repo.
export const TERMS_CONTACT = "halakouac@gmail.com";
export const TERMS_UPDATED = "2026-10-01";

export async function writeTerms({ today }) {
  await write(
    "terms/index.html",
    shell({
      title: "Terms and removals — Lab Ledger Desk",
      description:
        "How Lab Ledger Desk uses official lab and project announcements, what it does not do, and how a publisher asks to be removed from the board.",
      path: "/terms/",
      extra: jsonLdScript({
        "@context": "https://schema.org",
        "@type": "WebPage",
        name: "Terms and removals",
        url: SITE + "/terms/",
        publisher: { "@type": "NewsMediaOrganization", name: "Lab Ledger Desk", url: SITE + "/" },
        dateModified: TERMS_UPDATED,
      }),
      body: [
        "<article class=\"method\">",
        "<p class=\"kicker\">House policy</p>",
        "<h1>Terms and removals</h1>",
        "<p class=\"dek\">This page states what Lab Ledger Desk does with the official announcements it reads, and the path for a publisher who wants their material off the board. It is the desk's own house policy, not legal advice, and it draws no legal conclusion about any source or any brief.</p>",

        "<h2>What the desk publishes</h2>",
        "<p>Lab Ledger Desk is an automated index. It reads a fixed, public list of official lab feeds, release pages, and newsroom feeds, and writes one short brief per announcement. Every brief carries the date and a link to the primary source on the publisher's own site. The brief itself is a short factual summary written from that source, plus the tags the desk applies to file it. It does not publish the source's full text, and it does not repost the source's images except the publisher's own icon next to its name.</p>",
        "<p>The desk does not write anything a source did not say. Where a source is silent, the brief says so rather than filling the gap.</p>",

        "<h2>What the desk does not do</h2>",
        "<ul>",
        "<li>It does not publish a source's full article or full release notes — a brief is a summary that points back.</li>",
        "<li>It does not publish behind a paywall, and it does not charge for access to any brief.</li>",
        "<li>It does not attribute a claim to a source that source did not make, and it does not present a summary as a substitute for reading the original.</li>",
        "<li>It does not keep a brief online if the source asks for it to come down.</li>",
        "</ul>",

        "<h2>Ask for a removal</h2>",
        "<p>If you publish a source this desk reads and you want your feed, a specific brief, or your mark off the board, write to <code class=\"support-addr\">" + esc(TERMS_CONTACT) + "</code>. Please say which of these you are asking for, and include the lab or project name as it appears on the board:</p>",
        "<ol>",
        "<li><b>Remove one brief</b> — the desk deletes the brief at its URL and stops filing new items under it.</li>",
        "<li><b>Remove a whole source</b> — the desk removes the feed from its allow-list, stops reading it, and stops writing new briefs from it. Older briefs are removed on request or left linked at the publisher's option.</li>",
        "<li><b>Change how a source is described</b> — a name, a tag, or a classification the desk got wrong.</li>",
        "</ol>",
        "<p>Requests are read and applied by a person, not by the automation, and the site rebuilds within about fifteen minutes of a change being committed. There is no form and no ticket queue — one email, in any language.</p>",

        "<h2>What happens to an archived brief</h2>",
        "<p>Removing a source from the allow-list stops new briefs immediately. The desk does not consider its older archive automatically exempt: the publisher decides whether the existing briefs stay linked or are removed, and the desk will act either way on one request. Old URLs are never reused for a different item.</p>",

        "<h2>Contact, corrections, and security</h2>",
        "<p>Corrections to a specific brief go to the same address, and so does a report of a factual error on the board. Vulnerability reports follow <a href=\"https://github.com/halakou/labledger/blob/main/SECURITY.md\">the security policy</a> instead. The whole pipeline is open source at <a href=\"https://github.com/halakou/labledger\" rel=\"noreferrer noopener\">github.com/halakou/labledger</a>, including this page and the list of feeds it reads.</p>",
        "<p class=\"dek\"><i>Last updated " + TERMS_UPDATED + ".</i></p>",
        "</article>",
      ].join(""),
    }),
  );
  runLog.push("terms: written");
}
