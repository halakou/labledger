import { access, copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, extname, join } from "node:path";
import {
  AMP,
  FONT_DIR,
  FONT_UA,
  LAB_BY_ID,
  MARK_DIR,
  MARK_MAX,
  OG_CANDIDATES,
  OUT,
  PER_FEED,
  UA,
  classifyKind,
  classifyTopics,
  clip,
  clipSentence,
  composeWhat,
  composeWhy,
  hostAllowed,
  hostOf,
  metaContent,
  runLog,
  slugify,
  strip,
  tag,
  timeDatetime,
  ymd,
} from "./core.mjs";
import { OPEN_BY_ID } from "./config.mjs";

export async function fetchHttps(url, accept, hosts) {
  if (!hostAllowed(url, hosts) && !hosts.includes("fonts.googleapis.com") && !hosts.includes("fonts.gstatic.com")) {
    throw new Error("off allowlist " + url);
  }
  const res = await fetch(url, {
    headers: { "user-agent": UA, accept },
    redirect: "manual",
    signal: AbortSignal.timeout(12000),
  });
  if (res.status >= 300 && res.status < 400) {
    const loc = res.headers.get("location") || "";
    const hop = new URL(loc, url);
    if (hop.protocol !== "https:") throw new Error("bad redirect");
    const nextHost = hop.hostname.replace(/^www\./, "");
    const originHost = hostOf(url);
    if (!hosts.includes(nextHost) && nextHost !== originHost) throw new Error("redirect off allowlist");
    const again = await fetch(hop.toString(), {
      headers: { "user-agent": UA, accept },
      redirect: "manual",
      signal: AbortSignal.timeout(12000),
    });
    if (!again.ok) throw new Error(url + " " + again.status);
    return { res: again, url: hop.toString() };
  }
  if (!res.ok) throw new Error(url + " " + res.status);
  return { res, url };
}

export async function fetchText(url, accept, hosts) {
  const { res } = await fetchHttps(url, accept, hosts);
  return res.text();
}

export async function fetchFeed(url, hosts) {
  return fetchText(url, "application/rss+xml, application/xml, text/xml, text/html;q=0.8", hosts);
}

export function isBoilerplate(text) {
  const t = String(text || "").toLowerCase();
  return (
    t.includes("is an ai safety and research company") ||
    t.includes("working to build reliable, interpretable") ||
    t.includes("we\u2019re an ai research company")
  );
}

export function firstParagraph(html) {
  const post = html.match(/<p[^>]*post-text[^>]*>([\s\S]*?)<\/p>/i);
  if (post?.[1]) return strip(post[1]);
  const article = html.match(/<article[\s\S]{0,8000}/i);
  const chunk = article ? article[0] : html.slice(0, 12000);
  const ps = [...chunk.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)]
    .map((m) => strip(m[1]))
    .filter((t) => t.length > 60 && !isBoilerplate(t));
  return ps[0] || "";
}

export function parseLooseDate(html) {
  const m = html.match(
    /\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+(\d{1,2}),\s+(\d{4})\b/,
  );
  if (!m) return null;
  const d = new Date(m[0] + " UTC");
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function fetchArticleMeta(url, hosts) {
  const html = await fetchText(url, "text/html,application/xhtml+xml", hosts);
  const title = strip(metaContent(html, "og:title") || tag(html.slice(0, 8000), "title"));
  let description = strip(metaContent(html, "og:description") || metaContent(html, "description"));
  if (!description || isBoilerplate(description)) description = firstParagraph(html);
  const publishedRaw =
    metaContent(html, "article:published_time") ||
    metaContent(html, "og:updated_time") ||
    timeDatetime(html);
  let publishedAt = publishedRaw ? new Date(publishedRaw) : null;
  if (!publishedAt || Number.isNaN(publishedAt.getTime())) publishedAt = parseLooseDate(html);
  return {
    title: title.slice(0, 220),
    description: description.slice(0, 2500),
    publishedAt: publishedAt && !Number.isNaN(publishedAt.getTime()) ? publishedAt : new Date(),
  };
}

export function parseListingLinks(html, lab) {
  const found = [];
  const seen = new Set();
  const re = /href=["']((?:https:\/\/(?:www\.)?anthropic\.com)?\/news\/([a-z0-9][-a-z0-9]{2,}))\/?["']/gi;
  let m;
  while ((m = re.exec(html))) {
    const slug = m[2];
    if (["index", "page", "rss", "feed", "category"].includes(slug)) continue;
    const link = "https://www.anthropic.com/news/" + slug;
    if (seen.has(link)) continue;
    if (!hostAllowed(link, lab.hosts)) continue;
    seen.add(link);
    found.push(link);
  }
  return found;
}

export async function fetchListing(lab) {
  const html = await fetchText(lab.listing, "text/html,application/xhtml+xml", lab.hosts);
  const links = parseListingLinks(html, lab).slice(0, PER_FEED);
  const items = [];
  for (const link of links) {
    try {
      const meta = await fetchArticleMeta(link, lab.hosts);
      if (!meta.title) continue;
      items.push({
        title: meta.title,
        link,
        guid: link,
        publishedAt: meta.publishedAt,
        summary: meta.description,
        via: "listing",
      });
    } catch (err) {
      runLog.push(lab.label + " article skip: " + (err?.message || err));
    }
  }
  return items;
}

export async function fillEmptySummaries(items, lab) {
  const empty = items.filter((item) => !item.summary).slice(0, 8);
  await Promise.all(
    empty.map(async (item) => {
      try {
        const meta = await fetchArticleMeta(item.link, lab.hosts);
        if (meta.description) item.summary = meta.description;
        if (meta.title && meta.title.length > 8) item.title = meta.title;
      } catch {
        /* official page unavailable; keep the RSS title */
      }
    }),
  );
}

export async function loadJson(path, fallback) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return fallback;
  }
}

export async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export function extFrom(url, type) {
  const fromUrl = extname(new URL(url).pathname).toLowerCase();
  if ([".ico", ".png", ".svg", ".webp", ".jpg", ".jpeg"].includes(fromUrl)) return fromUrl;
  if (/svg/i.test(type)) return ".svg";
  if (/png/i.test(type)) return ".png";
  if (/webp/i.test(type)) return ".webp";
  if (/jpe?g/i.test(type)) return ".jpg";
  return ".ico";
}

export function looksLikeImage(buf, type) {
  if (buf.length < 8 || buf.length > MARK_MAX) return false;
  if (buf[0] === 0x89 && buf[1] === 0x50) return true;
  if (buf[0] === 0x00 && buf[1] === 0x00 && buf[2] === 0x01) return true;
  if (buf[0] === 0xff && buf[1] === 0xd8) return true;
  if (buf.slice(0, 4).toString("ascii") === "RIFF") return true;
  const head = buf.slice(0, 200).toString("utf8").toLowerCase();
  if (head.includes("<svg") || head.includes("<?xml")) return true;
  if (/image\/|icon|svg/i.test(type)) return true;
  return false;
}

export async function fetchMark(lab) {
  await mkdir(MARK_DIR, { recursive: true });
  for (const ext of [".svg", ".png", ".ico", ".webp", ".jpg"]) {
    const cached = join(MARK_DIR, lab.id + ext);
    if (await exists(cached)) return "/marks/" + lab.id + ext;
  }
  for (const url of lab.icons || []) {
    if (!hostAllowed(url, lab.hosts)) continue;
    try {
      const { res } = await fetchHttps(url, "image/*, image/svg+xml, */*", lab.hosts);
      const type = res.headers.get("content-type") || "";
      const buf = Buffer.from(await res.arrayBuffer());
      if (!looksLikeImage(buf, type)) continue;
      const ext = extFrom(url, type);
      const dest = join(MARK_DIR, lab.id + ext);
      await writeFile(dest, buf);
      return "/marks/" + lab.id + ext;
    } catch {
      /* letter fallback */
    }
  }
  return null;
}

export async function ensureFonts() {
  await mkdir(FONT_DIR, { recursive: true });
  const files = {
    "fraunces-600.woff2": null,
    "source-sans-3-400.woff2": null,
    "source-sans-3-600.woff2": null,
  };
  const haveAll = await Promise.all(Object.keys(files).map((name) => exists(join(FONT_DIR, name))));
  if (haveAll.every(Boolean)) return Object.keys(files);
  try {
    const cssRes = await fetch(
      "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600" +
        AMP +
        "family=Source+Sans+3:wght@400;600" +
        AMP +
        "display=swap",
      { headers: { "user-agent": FONT_UA, accept: "text/css" }, signal: AbortSignal.timeout(12000) },
    );
    if (!cssRes.ok) throw new Error("font css " + cssRes.status);
    const css = await cssRes.text();
    const blocks = css.split("/* ");
    for (const block of blocks) {
      if (!block.startsWith("latin */")) continue;
      const family = (block.match(/font-family:\s*'([^']+)'/) || [])[1];
      const weight = (block.match(/font-weight:\s*(\d+)/) || [])[1];
      const src = (block.match(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/) || [])[1];
      if (!family || !weight || !src) continue;
      const name =
        family === "Fraunces" ? "fraunces-" + weight + ".woff2" : "source-sans-3-" + weight + ".woff2";
      if (!files[name]) files[name] = src;
    }
    for (const [name, src] of Object.entries(files)) {
      if (!src) continue;
      if (await exists(join(FONT_DIR, name))) continue;
      const res = await fetch(src, {
        headers: { "user-agent": FONT_UA },
        signal: AbortSignal.timeout(12000),
      });
      if (!res.ok) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 1000) continue;
      await writeFile(join(FONT_DIR, name), buf);
    }
  } catch (err) {
    runLog.push("fonts: " + (err?.message || err));
  }
  return Object.keys(files);
}

export async function write(path, content) {
  const full = join(OUT, path);
  await mkdir(dirname(full), { recursive: true });
  await writeFile(full, content);
}

export async function copyOg() {
  for (const p of OG_CANDIDATES) {
    try {
      await access(p);
      await copyFile(p, join(OUT, "og.jpg"));
      return true;
    } catch {}
  }
  return false;
}

export function makeBrief(pack, item, ledgerId) {
  const { year, month, day } = ymd(item.publishedAt);
  const slug = slugify(item.title);
  const path = "/b/" + year + "/" + month + "/" + day + "/" + slug + "/";
  const headline = item.title;
  const summary = item.summary;
  const dateLabel = year + "-" + month + "-" + day;
  const kind = classifyKind(headline, summary);
  const topics = classifyTopics(headline, summary);
  const dek = clipSentence(summary, 168) || clip(pack.lab.label + " published \u201c" + headline + ".\u201d", 158);
  const what = composeWhat(summary, pack.lab.label, headline, dateLabel);
  const why = composeWhy(pack.lab.label, dateLabel, kind, topics, summary);
  return {
    lab: pack.lab.label,
    labId: pack.lab.id,
    mark: pack.lab.mark,
    color: pack.lab.color,
    markFile: pack.lab.markFile || null,
    headline,
    dek,
    what,
    why,
    kind,
    topics,
    source: item.link,
    guid: item.guid || item.link,
    via: item.via || "rss",
    year,
    month,
    day,
    slug,
    path,
    dateLabel,
    publishedAt: item.publishedAt.toISOString(),
    telegramUrl: null,
    ledgerId,
    briefNo: String(ledgerId).padStart(3, "0"),
  };
}

export function reviveBrief(raw) {
  const lab = LAB_BY_ID[raw.labId] || OPEN_BY_ID[raw.labId];
  const publishedAt = new Date(raw.publishedAt);
  const kind = raw.kind || classifyKind(raw.headline || "", raw.dek || "");
  const topics = Array.isArray(raw.topics) ? raw.topics : classifyTopics(raw.headline || "", raw.dek || "");
  return {
    ...raw,
    mark: lab?.mark || raw.mark,
    color: lab?.color || raw.color,
    markFile: lab?.markFile || raw.markFile || null,
    kind,
    topics,
    publishedAt: Number.isNaN(publishedAt.getTime()) ? new Date().toISOString() : publishedAt.toISOString(),
    briefNo: String(raw.ledgerId || raw.briefNo || 0).padStart(3, "0"),
  };
}

export function mondayOf(date) {
  const x = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const diff = (x.getUTCDay() + 6) % 7;
  x.setUTCDate(x.getUTCDate() - diff);
  return x;
}

export function formatRange(start, end) {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return (
    start.getUTCDate() +
    " " +
    months[start.getUTCMonth()] +
    " \u2013 " +
    end.getUTCDate() +
    " " +
    months[end.getUTCMonth()] +
    " " +
    end.getUTCFullYear()
  );
}
