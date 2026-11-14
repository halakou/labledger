import { writeFile } from "node:fs/promises";
import {
  ARCHIVE_FILE,
  LABS,
  MAX_BRIEFS,
  PER_FEED,
  POSTED_FILE,
  QUEUE_FILE,
  RECENT_MS,
  boardPrimaries,
  classifyKind,
  classifyTopics,
  clip,
  clipSentence,
  clusterBriefs,
  composeWhat,
  composeWhy,
  hostAllowed,
  isThinBrief,
  kindLabel,
  parseFeed,
  presentRelease,
  queueFromBoard,
  runLog,
  selectBoard,
} from "./desk/core.mjs";
import {
  ensureFonts,
  fetchFeed,
  fetchListing,
  fetchText,
  fillEmptySummaries,
  isBoilerplate,
  loadJson,
  makeBrief,
  reviveBrief,
} from "./desk/net.mjs";
import { fetchMark } from "./desk/fetch-mark.mjs";
import { publishSite } from "./desk/pages.mjs";
import { OPEN_PROJECTS, PER_OPEN, MAX_OPEN, OPEN_ARCHIVE_FILE, OPEN_BLOCK, WATCHDOG } from "./desk/config.mjs";

const fontNames = await ensureFonts();
// P1-4: the /status/ page shows a BUILD-TIME snapshot of the watchdog's
// /health — never a live fetch from a reader's browser. The fetch runs
// through net.mjs, so the allow-list still gates it; the only host is
// the project's own Worker (WATCHDOG in config.mjs). It starts here so
// it runs in parallel with the feed fetching below, and is awaited just
// before publishSite. A failure is not fatal: the snapshot says the
// watchdog was unreachable, and the page says so instead of showing a
// green that is not true.
async function fetchWatchdog() {
  const fetchedAt = new Date().toISOString();
  try {
    const raw = await fetchText(WATCHDOG.url, "application/json", WATCHDOG.hosts);
    const json = JSON.parse(raw);
    const last = json && typeof json === "object" ? json.last : null;
    if (!last || typeof last !== "object" || !last.heartbeat || !last.builtAt) {
      throw new Error("unexpected /health shape");
    }
    return {
      reachable: true,
      ok: json.ok === true,
      heartbeat: String(last.heartbeat),
      builtAt: String(last.builtAt),
      siteHttp: Number(last.siteHttp) || 0,
      ageMs: Number(last.ageMs) || 0,
      dispatch: String(last.dispatch || "unknown"),
      staleAfterMs: Number(last.staleAfterMs) || 720000,
      fetchedAt,
    };
  } catch (err) {
    runLog.push("watchdog: unreachable " + (err?.message || err));
    return { reachable: false, fetchedAt };
  }
}
const watchdogPromise = fetchWatchdog();
const markMap = {};
await Promise.all(
  LABS.map(async (lab) => {
    const file = await fetchMark(lab);
    lab.markFile = file;
    markMap[lab.id] = file;
  }),
);
// Open releases rail: fetch marks for open projects too, so cards can carry them.
await Promise.all(
  OPEN_PROJECTS.map(async (proj) => {
    const file = await fetchMark(proj);
    proj.markFile = file;
    markMap[proj.id] = file;
  }),
);

async function fetchOpenPack(proj) {
  if (proj.kind === "blog" && proj.feed) {
    const xml = await fetchFeed(proj.feed, proj.hosts);
    const items = parseFeed(xml).filter((item) => hostAllowed(item.link, proj.hosts)).slice(0, PER_OPEN * 2);
    return { proj, items };
  }
  if (proj.kind === "github" && proj.feed) {
    const xml = await fetchFeed(proj.feed, proj.hosts);
    const items = parseFeed(xml)
      .filter((item) => item.link.startsWith("https://github.com/"))
      .filter((item) => !OPEN_BLOCK.some((re) => re.test(item.title.trim())))
      .map((item) => presentRelease(proj.label, item))
      .slice(0, PER_OPEN * 2);
    return { proj, items };
  }
  return { proj, items: [] };
}

const packs = await Promise.all(
  LABS.map(async (lab) => {
    try {
      if (lab.listing && !lab.feed) {
        const items = await fetchListing(lab);
        runLog.push(lab.label + ": listing " + items.length);
        return { lab, items };
      }
      if (!lab.feed) return { lab, items: [] };
      const xml = await fetchFeed(lab.feed, lab.hosts);
      const items = parseFeed(xml)
        .filter((item) => hostAllowed(item.link, lab.hosts))
        .slice(0, PER_FEED * 2);
      await fillEmptySummaries(items, lab);
      runLog.push(lab.label + ": rss " + items.length);
      return { lab, items };
    } catch (err) {
      runLog.push(lab.label + ": fail " + (err?.message || err));
      return { lab, items: [] };
    }
  }),
);

const archiveRaw = await loadJson(ARCHIVE_FILE, { briefs: [], nextId: 1 });
const byGuid = new Map();
for (const raw of archiveRaw.briefs || []) {
  if (!raw?.guid) continue;
  byGuid.set(raw.guid, reviveBrief(raw));
}
let nextId = Number(archiveRaw.nextId) || 1;
if (byGuid.size) {
  const maxId = Math.max(
    0,
    ...[...byGuid.values()].map((b) => Number(b.ledgerId) || 0),
  );
  nextId = Math.max(nextId, maxId + 1);
}

const fresh = [];
const used = new Set();
function takeRoundRobin(pred) {
  for (let i = 0; i < PER_FEED * 2; i += 1) {
    for (const pack of packs) {
      if (fresh.length >= MAX_BRIEFS * 2) return;
      const item = pack.items[i];
      if (!item || used.has(item.link) || used.has(item.guid)) continue;
      if (pred && !pred(item)) continue;
      used.add(item.link);
      used.add(item.guid);
      fresh.push({ pack, item });
    }
  }
}
const now = Date.now();
for (const pack of packs) {
  const item = pack.items[0];
  if (!item || used.has(item.link) || used.has(item.guid)) continue;
  used.add(item.link);
  used.add(item.guid);
  fresh.push({ pack, item });
}
takeRoundRobin((item) => now - item.publishedAt.getTime() <= RECENT_MS);
takeRoundRobin(null);

for (const { pack, item } of fresh) {
  const guid = item.guid || item.link;
  if (byGuid.has(guid)) {
    const prev = byGuid.get(guid);
    prev.markFile = pack.lab.markFile || prev.markFile;
    prev.color = pack.lab.color;
    if (item.summary && item.summary.length > 40 && !isBoilerplate(item.summary)) {
      const dateLabel = prev.dateLabel;
      const kind = classifyKind(item.title, item.summary);
      const topics = classifyTopics(item.title, item.summary);
      prev.headline = item.title.slice(0, 220);
      prev.dek = clip(item.summary, 158);
      prev.what = composeWhat(item.summary, pack.lab.label, item.title, dateLabel);
      prev.why = composeWhy(pack.lab.label, dateLabel, kind, topics);
      prev.kind = kind;
      prev.topics = topics;
      prev.via = item.via || prev.via;
    }
    continue;
  }
  const brief = makeBrief(pack, item, nextId);
  nextId += 1;
  byGuid.set(brief.guid, brief);
}

const posted = await loadJson(POSTED_FILE, {});
for (const b of byGuid.values()) {
  if (posted[b.guid]) b.telegramUrl = posted[b.guid];
}

let allBriefs = [...byGuid.values()].sort(
  (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
);
// P0-2: no cap. The archive keeps every filed brief, so a filed URL stays
// put (invariant 6). The old 500-brief cap slice deleted briefs from the
// archive file itself, and the next build dropped their /b/ pages (404).
await writeFile(
  ARCHIVE_FILE,
  JSON.stringify({
    nextId,
    briefs: allBriefs.map((b) => ({
      ...b,
      // ogImage is a per-build derived value (see writeOgCards), not source
      // data: never persist a card path the next build may not regenerate.
      ogImage: undefined,
      publishedAt: typeof b.publishedAt === "string" ? b.publishedAt : new Date(b.publishedAt).toISOString(),
    })),
  }),
);

// P0-1 (rework): the board shows one row per story, not one row per filing.
// Briefs filed within 48h whose titles are near-duplicates (same story from
// several labs) collapse into their EARLIEST brief's row — the primary is
// stable across builds, so a story never changes headline, lab or kind when
// a newer filing arrives, and the channel never posts it twice. The others
// are listed on that row as "also filed by …" with links to their own /b/
// pages.
//
// The collapse happens here, AFTER the archive write above, and only in
// memory: every brief stays in the archive with its own /b/ page (old
// URLs stay — invariant 6), and alsoFiled is never persisted to
// .desk-archive.json; the next build recomputes it from the archive.
// boardPrimaries clones the primaries, so the annotation never leaks into
// the briefs themselves (the first version mutated them, and /week/ showed
// both the annotation and the duplicate row).
//
// Clustering must never abort the build: an uncaught throw here used to
// freeze desk-status.json, so a failure falls back to the unclustered board
// and is logged on the method page.
//
// Because the Telegram queue and feed.json are both built from `briefs`
// below, a duplicate filing also takes no separate Telegram slot and no
// separate feed slot. Two layers keep a story to one post: the primary is
// the stable earliest filing, and queueFromBoard suppresses a primary whose
// alsoFiled list holds a guid that was already posted (an older filing that
// arrived late and took over as primary).
// P0-3: thin briefs are filed and keep their pages, but take no board
// slot and are never posted. A filing whose "what" is a bare category
// label, a "blog post by …" line, or the empty-summary fallback sentence
// has almost no substance (isThinBrief: under 12 words of what). Filter
// them out of the board pool BEFORE clustering, so the earliest NON-thin
// filing becomes the cluster primary and a thin filing can never smuggle
// a thin row onto the board — filtering after clustering would drop a
// whole cluster whose primary happened to be thin. The Telegram queue
// and feed.json both derive from `briefs` below, and RSS derives from it
// too, so one filter covers all three surfaces; /lab/, /week/, search
// and the /b/ pages still render from allBriefs. The same filter applies
// to the unclustered fallback: a cluster failure must never re-admit
// thin briefs to the board.
const boardPool = allBriefs.filter((b) => !isThinBrief(b));

const today = new Date().toISOString().slice(0, 10);
let clusters = [];
let clusterPrimaries = [...boardPool];
try {
  clusters = clusterBriefs(boardPool);
  clusterPrimaries = boardPrimaries(clusters);
} catch (err) {
  runLog.push("cluster fail " + (err?.message || err) + " — board unclustered");
  clusters = [];
  clusterPrimaries = [...boardPool];
}

// Cluster notes for the /b/ pages, keyed by guid: the primary's page lists
// its other filings, each duplicate's page points back at the primary.
// Built from the clusters, never by mutating a brief.
const clusterNotes = new Map();
for (const { primary, also } of clusters) {
  if (!also.length) continue;
  const alsoFiled = also.map((b) => ({
    guid: b.guid,
    lab: b.lab,
    labId: b.labId,
    path: b.path,
    headline: b.headline,
    dateLabel: b.dateLabel,
  }));
  clusterNotes.set(primary.guid, { alsoFiled });
  for (const dup of also) {
    clusterNotes.set(dup.guid, {
      clusterPrimary: {
        lab: primary.lab,
        path: primary.path,
        headline: primary.headline,
        dateLabel: primary.dateLabel,
      },
    });
  }
}

// The board leads with today's briefs, then backfills the most recent earlier
// ones so a quiet morning still shows a full board. The desk date is the date
// the build ran, so "today" means "filed since the last desk day started".
const briefs = selectBoard(clusterPrimaries, today, MAX_BRIEFS);

// --- Open releases rail -------------------------------------------------
const openPacks = await Promise.all(
  OPEN_PROJECTS.map(async (proj) => {
    try {
      const pack = await fetchOpenPack(proj);
      runLog.push(proj.label + ": open " + pack.items.length);
      return pack;
    } catch (err) {
      runLog.push(proj.label + ": open fail " + (err?.message || err));
      return { proj, items: [] };
    }
  }),
);

const openArchiveRaw = await loadJson(OPEN_ARCHIVE_FILE, { briefs: [], nextId: 1 });
const openByGuid = new Map();
for (const raw of openArchiveRaw.briefs || []) {
  if (!raw?.guid) continue;
  openByGuid.set(raw.guid, reviveBrief(raw));
}
let openNextId = Number(openArchiveRaw.nextId) || 1;
if (openByGuid.size) {
  const maxId = Math.max(0, ...[...openByGuid.values()].map((b) => Number(b.ledgerId) || 0));
  openNextId = Math.max(openNextId, maxId + 1);
}

// newest-first across all open projects, at most PER_OPEN per project
const openPool = [];
for (const { proj, items } of openPacks) {
  // The refresh loop below must see every entry the feed returned, not just the
  // first PER_OPEN: a brief filed before the commit-trailer strip landed is
  // still wrong no matter how deep in the feed it sits, and slicing here would
  // leave the older ones stuck on a Signed-off-by summary forever.
  for (const item of items) {
    const guid = item.guid || item.link;
    if (openByGuid.has(guid)) {
      const prev = openByGuid.get(guid);
      if (item.title && item.title !== prev.headline) prev.headline = item.title.slice(0, 220);
      const prevWords = String(prev.what || "").split(/\s+/).filter(Boolean).length;
      // An entry filed before the commit-trailer strip landed keeps a what/
      // that is nothing but provenance ("Signed-off-by: … Co-authored-by: …").
      // It has enough words to look substantial, so the thin-release guard
      // above protects it from ever being replaced. Detect that state directly
      // and let the clean summary through.
      const dirty = /signed-off-by|co-?authored-by|reviewed-by|cherry picked from commit/i.test(prev.what || prev.dek || "");
      if (dirty || !item.thinRelease || prevWords < 12) {
        const dateLabel = prev.dateLabel;
        const kind = classifyKind(item.title, item.summary);
        const topics = classifyTopics(item.title, item.summary);
        const next = clipSentence(item.summary, 168) || "";
        prev.dek = dirty && !next ? "" : next || prev.dek;
        prev.what = composeWhat(item.summary, proj.label, item.title, dateLabel);
        prev.why = composeWhy(proj.label, dateLabel, kind, topics);
        prev.kind = kind;
        prev.topics = topics;
      }
      continue;
    }
    if (openPool.filter((b) => b.labId === proj.id).length >= PER_OPEN) continue;
    const fakePack = { lab: { ...proj, label: proj.label } };
    const brief = makeBrief(fakePack, item, openNextId);
    brief.lab = proj.label;
    brief.labId = proj.id;
    brief.mark = proj.mark;
    brief.color = proj.color;
    brief.markFile = proj.markFile || null;
    brief.via = proj.kind === "github" ? "github release" : "official blog";
    openPool.push(brief);
    openNextId += 1;
  }
}
openPool.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
for (const brief of openPool) {
  if (openByGuid.has(brief.guid)) continue;
  openByGuid.set(brief.guid, brief);
}

let allOpen = [...openByGuid.values()].sort(
  (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
);
// P0-2: no cap, same as the lab archive above — the old 200-release cap
// slice deleted open releases from the archive and dropped their /b/ pages.
await writeFile(
  OPEN_ARCHIVE_FILE,
  JSON.stringify({
    nextId: openNextId,
    briefs: allOpen.map((b) => ({
      ...b,
      // ogImage is a per-build derived value, not source data (see above).
      ogImage: undefined,
      publishedAt: typeof b.publishedAt === "string" ? b.publishedAt : new Date(b.publishedAt).toISOString(),
    })),
  }),
);
const openBriefs = allOpen.slice(0, MAX_OPEN);
await writeFile(
  QUEUE_FILE,
  JSON.stringify({
    // queueFromBoard drops a primary whose alsoFiled list holds an
    // already-posted guid: the story was posted once already, under an
    // earlier primary. alsoFiled travels with the queue entry so the
    // Telegram post can name the other filings.
    briefs: queueFromBoard(briefs, posted).map((b) => ({
      guid: b.guid,
      headline: b.headline,
      path: b.path,
      lab: b.lab,
      dek: b.dek,
      kind: b.kind,
      kindLabel: kindLabel(b.kind),
      source: b.source,
      publishedAt: b.publishedAt,
      alsoFiled: (b.alsoFiled || []).map((f) => ({
        lab: f.lab,
        headline: f.headline,
        dateLabel: f.dateLabel,
        path: f.path,
      })),
    })),
    open: openBriefs.map((b) => ({
      guid: b.guid,
      headline: b.headline,
      path: b.path,
      lab: b.lab,
      dek: b.dek,
      kind: b.kind,
      kindLabel: kindLabel(b.kind),
      source: b.source,
      publishedAt: b.publishedAt,
    })),
  }),
);

const watchdog = await watchdogPromise;
await publishSite({ allBriefs, briefs, boardPool, openBriefs, allOpen, today, fontNames, markMap, clusterNotes, watchdog });
