// P1-4: the public status page. It shows a BUILD-TIME snapshot — the
// values below are the ones the build itself saw, frozen into static
// HTML. Nothing on this page is a live reading: the page adds no script
// (invariant 7 — the one inline script in render.mjs is the only script
// the site ships), and no reader's browser fetches the watchdog. The
// snapshot time is printed next to every watchdog value so a reader can
// tell how old it is.
//
// The watchdog snapshot comes from build-desk.mjs, which fetches the
// Worker's /health through net.mjs (allow-list gated; the only host is
// the project's own Worker, WATCHDOG in config.mjs). When that fetch
// fails, the snapshot is { reachable: false } and the page says so
// plainly — it never shows a green that is not true.
import { SITE, esc } from "./core.mjs";
import { write } from "./net.mjs";
import { jsonLdScript, shell } from "./render.mjs";

// The freshness judgment, computed at build time from the snapshot's
// own numbers. The caller passes the raw snapshot; this is the one place
// the rule lives, so the page and the tests can never disagree about
// what "stale" means.
export function watchdogState(watchdog) {
  if (!watchdog || watchdog.reachable !== true) return "UNKNOWN";
  if (Number(watchdog.siteHttp) !== 200) return "DEGRADED";
  if (Number(watchdog.ageMs) > Number(watchdog.staleAfterMs || 720000)) return "STALE";
  return "OK";
}

export async function writeStatus({ builtAt, feeds, boards, watchdog = { reachable: false }, today }) {
  const state = watchdogState(watchdog);
  const ageMin =
    watchdog && watchdog.reachable === true
      ? Math.max(0, Math.round(Number(watchdog.ageMs || 0) / 60000))
      : null;
  const watchdogBlock =
    watchdog && watchdog.reachable === true
      ? [
          "<p>Watchdog state at the snapshot: <b>",
          esc(state),
          "</b>.</p>",
          "<ul>",
          "<li>Last heartbeat: <time datetime=\"",
          esc(String(watchdog.heartbeat)),
          "\">",
          esc(String(watchdog.heartbeat)),
          "</time></li>",
          "<li>Last build the watchdog saw: <time datetime=\"",
          esc(String(watchdog.builtAt)),
          "\">",
          esc(String(watchdog.builtAt)),
          "</time></li>",
          "<li>Site check: HTTP ",
          esc(String(watchdog.siteHttp)),
          "</li>",
          "<li>Site age at the snapshot: ",
          esc(String(ageMin)),
          " minute" + (ageMin === 1 ? "" : "s") + " (stale after " + Math.round(Number(watchdog.staleAfterMs || 720000) / 60000) + " minutes)</li>",
          "<li>Dispatch: ",
          esc(String(watchdog.dispatch)),
          "</li>",
          "</ul>",
          "<p>Snapshot taken at <time datetime=\"",
          esc(String(watchdog.fetchedAt)),
          "\">",
          esc(String(watchdog.fetchedAt)),
          "</time> during this build. A reader loading this page later is looking at that moment, not at now.</p>",
        ].join("")
      : [
          "<p><b>Watchdog state: UNKNOWN.</b> The watchdog could not be reached when this page was built (snapshot attempted at <time datetime=\"",
          esc(String(watchdog.fetchedAt || builtAt)),
          "\">",
          esc(String(watchdog.fetchedAt || builtAt)),
          "</time>), so its last heartbeat is unknown. The page shows no watchdog state rather than a green that is not true.</p>",
        ].join("");
  await write(
    "status/index.html",
    shell({
      title: "Desk status — Lab Ledger Desk",
      description: "How the desk is running: last build, watchdog heartbeat, and what is being watched.",
      path: "/status/",
      extra: jsonLdScript({
        "@context": "https://schema.org",
        "@type": "WebPage",
        name: "Desk status — Lab Ledger Desk",
        url: SITE + "/status/",
        dateModified: today,
        publisher: { "@type": "NewsMediaOrganization", name: "Lab Ledger Desk", url: SITE + "/" },
      }),
      body: [
        "<article class=\"method\"><p class=\"kicker\">Status</p><h1>Desk status</h1>",
        "<p class=\"dek\">How the desk is running, as of the last build. Every value below is a snapshot taken during that build — nothing on this page is a live reading.</p></article>",
        "<section class=\"block\"><h2>Last build</h2>",
        "<p>Built at <time datetime=\"",
        esc(builtAt),
        "\">",
        esc(builtAt),
        "</time> (UTC).</p>",
        "<p>The desk reads <b>",
        esc(String(feeds)),
        "</b> official feeds and <b>",
        esc(String(boards)),
        "</b> release boards. The same timestamp is written to <a href=\"/desk-status.json\">desk-status.json</a>.</p></section>",
        "<section class=\"block\"><h2>Watchdog</h2>",
        watchdogBlock,
        "</section>",
        "<section class=\"block\"><h2>What is watched</h2>",
        "<p>The watchdog checks the site every 5 minutes and dispatches a new build when the site is older than 12 minutes. The desk itself builds about every 15 minutes. The site is always published before the same briefs are posted to <a href=\"https://t.me/labledgerdesk\" rel=\"noreferrer noopener\">Telegram</a> — the channel never leads the site.</p>",
        "<p><a href=\"/method/\">How the desk works \u2192</a></p></section>",
      ].join(""),
    }),
  );
}
