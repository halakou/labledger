// C-work3 / privacy: the desk had a /terms/ page and no /privacy/, which left
// the obvious question unanswered in public. Unlike the terms page this one is
// short because the answer is short: there is nothing to disclose beyond what
// the pipeline already is. No analytics, no advertising, no tracking pixels,
// no account, no cookie. The page exists to say that plainly, and to name the
// two hosts a reader's browser actually talks to.
//
// Scope note, same as terms.mjs: this is the desk's own statement, not legal
// advice, and it draws no legal conclusion.
import { CHANNEL, SITE, esc, runLog } from "./core.mjs";
import { jsonLdScript, shell } from "./render.mjs";
import { write } from "./net.mjs";
// The removal address lives in terms.mjs — one place both pages point at, so a
// contact change is a single edit and the two pages cannot drift apart.
import { TERMS_CONTACT } from "./terms.mjs";

export const PRIVACY_UPDATED = "2026-10-01";

export async function writePrivacy() {
  await write(
    "privacy/index.html",
    shell({
      title: "Privacy — Lab Ledger Desk",
      description:
        "What Lab Ledger Desk collects: nothing. No analytics, no cookies, no account, no advertising. The hosts a browser talks to, named.",
      path: "/privacy/",
      extra: jsonLdScript({
        "@context": "https://schema.org",
        "@type": "WebPage",
        name: "Privacy",
        url: SITE + "/privacy/",
        publisher: { "@type": "NewsMediaOrganization", name: "Lab Ledger Desk", url: SITE + "/" },
        dateModified: PRIVACY_UPDATED,
      }),
      body: [
        "<article class=\"method\">",
        "<p class=\"kicker\">House policy</p>",
        "<h1>Privacy</h1>",
        "<p class=\"dek\">This page says what Lab Ledger Desk collects from a reader: nothing. It exists because a site with no privacy page leaves the question open, and the answer here is short because there is nothing to disclose.</p>",

        "<h2>No analytics, no advertising</h2>",
        "<p>The desk runs no analytics on this site. There is no page-view counter, no session tracker, no fingerprint, no advertising, and no third-party script that watches the reader. No beacon fires on load. The build does not include one, and the content-security-policy on every page refuses any script that is not the site's own.</p>",

        "<h2>No cookie, no account</h2>",
        "<p>There is no login, no comment box, and no setting to remember. The site does not set a cookie. The only thing a browser stores is the ordinary cache any static page uses, and the search box is a filter over the page you are already reading — it never leaves your device.</p>",

        "<h2>What a browser talks to</h2>",
        "<p>Reading a page loads three things from this site — the HTML, one stylesheet, and one font and sprite file — plus the publisher icon shown next to a source's name, which the build fetches once and stores here. Nothing else is contacted. The whole pipeline is open source at <a href=\"https://github.com/halakou/labledger\" rel=\"noreferrer noopener\">github.com/halakou/labledger</a>, so the claim above is checkable against the code that runs it.</p>",

        "<h2>Telegram</h2>",
        "<p>The desk mirrors the same briefs to a public Telegram channel. Telegram is a separate service with its own terms — following the channel means a reader is on Telegram's platform, not this one, and this site has no way to see who reads it. The channel link is on every page, and it is optional: the site is the source of record.</p>",

        "<h2>Removal and contact</h2>",
        "<p>This page makes no claim about any data the desk does not hold. If you are a publisher whose feed the desk reads, <a href=\"/terms/\">the terms and removal page</a> is the path for taking a source or a brief off the board; for anything else, write to <code class=\"support-addr\">" + esc(TERMS_CONTACT || "halakouac@gmail.com") + "</code>.</p>",
        "<p class=\"dek\"><i>Last updated " + PRIVACY_UPDATED + ".</i></p>",
        "</article>",
      ].join(""),
    }),
  );
  runLog.push("privacy: written");
}
