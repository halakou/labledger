import { writeFile } from "node:fs/promises";
import {
  ARCHIVE_FILE,
  ARCHIVE_MAX,
  LABS,
  MAX_BRIEFS,
  PER_FEED,
  POSTED_FILE,
  QUEUE_FILE,
  RECENT_MS,
  classifyKind,
  classifyTopics,
  clip,
  composeWhat,
  composeWhy,
  hostAllowed,
  kindLabel,
  parseFeed,
  runLog,
} from "./desk/core.mjs";
import {
  ensureFonts,
  fetchFeed,
  fetchListing,
  fillEmptySummaries,
  isBoilerplate,
  loadJson,
  makeBrief,
  reviveBrief,
} from "./desk/net.mjs";
import { fetchMark } from "./desk/fetch-mark.mjs";
import { publishSite } from "./desk/pages.mjs";
import { OPEN_PROJECTS, PER_OPEN, MAX_OPEN, OPEN_ARCHIVE_FILE, OPEN_ARCHIVE_MAX, OPEN_BLOCK } from "./desk/config.mjs";

const fontNames = await ensureFonts();
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
    if (proj.kind !== "github") return;
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
      prev.why = composeWhy(pack.lab.label, dateLabel, kind, topics, item.summary);
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
if (allBriefs.length > ARCHIVE_MAX) allBriefs = allBriefs.slice(0, ARCHIVE_MAX);
await writeFile(
  ARCHIVE_FILE,
  JSON.stringify({
    nextId,
    briefs: allBriefs.map((b) => ({
      ...b,
      publishedAt: typeof b.publishedAt === "string" ? b.publishedAt : new Date(b.publishedAt).toISOString(),
    })),
  }),
);

const briefs = allBriefs.slice(0, MAX_BRIEFS);
const today = new Date().toISOString().slice(0, 10);

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
  for (const item of items.slice(0, PER_OPEN)) {
    const guid = item.guid || item.link;
    if (openByGuid.has(guid)) continue;
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
if (allOpen.length > OPEN_ARCHIVE_MAX) allOpen = allOpen.slice(0, OPEN_ARCHIVE_MAX);
await writeFile(
  OPEN_ARCHIVE_FILE,
  JSON.stringify({
    nextId: openNextId,
    briefs: allOpen.map((b) => ({
      ...b,
      publishedAt: typeof b.publishedAt === "string" ? b.publishedAt : new Date(b.publishedAt).toISOString(),
    })),
  }),
);
const openBriefs = allOpen.slice(0, MAX_OPEN);
await writeFile(
  QUEUE_FILE,
  JSON.stringify({
    briefs: briefs.map((b) => ({
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

await publishSite({ allBriefs, briefs, openBriefs, allOpen, today, fontNames, markMap });
