import { access, mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { FONT_UA, MARK_DIR, MARK_MAX, hostAllowed, hostOf } from "./core.mjs";
import { houseSvg } from "./glyphs.mjs";
import { SEED_MARKS } from "./seed-marks.mjs";

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function extFrom(url, type) {
  const fromUrl = extname(new URL(url).pathname).toLowerCase();
  if ([".ico", ".png", ".svg", ".webp", ".jpg", ".jpeg"].includes(fromUrl)) return fromUrl;
  if (/svg/i.test(type)) return ".svg";
  if (/png/i.test(type)) return ".png";
  if (/webp/i.test(type)) return ".webp";
  if (/jpe?g/i.test(type)) return ".jpg";
  return ".ico";
}

async function fetchIcon(url, hosts) {
  const res = await fetch(url, {
    headers: { "user-agent": FONT_UA, accept: "image/*, image/svg+xml, */*" },
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
      headers: { "user-agent": FONT_UA, accept: "image/*, image/svg+xml, */*" },
      redirect: "manual",
      signal: AbortSignal.timeout(12000),
    });
    if (!again.ok) throw new Error(url + " " + again.status);
    return again;
  }
  if (!res.ok) throw new Error(url + " " + res.status);
  return res;
}

export function looksLikeMark(buf, type) {
  if (buf.length < 8 || buf.length > MARK_MAX) return false;
  const head = buf.slice(0, 240).toString("utf8").toLowerCase();
  // <!DOCTYPE svg> is the standard header of Illustrator/Inkscape SVGs, not
  // an HTML page. Rejecting it made real vector logos (PyTorch's) fall back
  // to the house star.
  if (head.includes("<html") || (head.includes("<!doctype html"))) return false;
  if (buf[0] === 0x89 && buf[1] === 0x50) return buf.length >= 400;
  if (buf[0] === 0x00 && buf[1] === 0x00 && buf[2] === 0x01) return buf.length >= 400;
  if (buf[0] === 0xff && buf[1] === 0xd8) return buf.length >= 400;
  if (buf.slice(0, 4).toString("ascii") === "RIFF") return buf.length >= 400;
  if (head.includes("<svg")) return buf.length >= 200;
  if (/image\/|icon|svg/i.test(type) && buf.length >= 400) return true;
  return false;
}

// The sentinel is the authoritative marker — a size heuristic would also
// catch small real vector marks (LangChain's official icon is 542 bytes).
function isHouseSvg(buf) {
  return buf.slice(0, 400).toString("utf8").includes("desk-house-glyph");
}
export { isHouseSvg as isHouseGlyph };

// The URL that produced a cached mark, so a cached file can be checked
// against the lab's current icon list. Without it, a mark cached from an old
// config (a 48px ICO that a new vector URL supersedes) would shadow the new
// source forever and the config change would never reach the live sprite.
function srcPath(lab) {
  return join(MARK_DIR, lab.id + ".src");
}

async function readSrc(lab) {
  try {
    return (await readFile(srcPath(lab), "utf8")).trim();
  } catch {
    return "";
  }
}

// A lab's mark is one file. When a newer source lands under a different
// extension (a vector .svg superseding an old .ico, or a seed .png replacing a
// house-glyph .svg), the leftovers are deleted so collectMarks' extension
// preference can never serve the superseded file.
async function pruneOtherExts(lab, keepExt) {
  for (const ext of [".svg", ".png", ".ico", ".webp", ".jpg"]) {
    if (ext === keepExt) continue;
    const p = join(MARK_DIR, lab.id + ext);
    try { await unlink(p); } catch { /* not there */ }
  }
}

export async function fetchMark(lab) {
  await mkdir(MARK_DIR, { recursive: true });
  const want = (lab.icons || [])[0] || "";
  // Vector first, to match collectMarks(): a cached .svg is the best mark we
  // have, and a stale raster from an older icon list must never shadow it.
  let stale = null;
  for (const ext of [".svg", ".png", ".ico", ".webp", ".jpg"]) {
    const cached = join(MARK_DIR, lab.id + ext);
    if (!(await exists(cached))) continue;
    const buf = await readFile(cached);
    if (isHouseSvg(buf)) continue;
    if (!looksLikeMark(buf, ext === ".svg" ? "image/svg+xml" : "image/" + ext.slice(1))) continue;
    // A mark from the currently configured source is as good as it gets.
    if ((await readSrc(lab)) === want) {
      await pruneOtherExts(lab, ext);
      return "/marks/" + lab.id + ext;
    }
    // Otherwise remember it as the last-resort fallback and go re-fetch.
    if (!stale) stale = ext;
    break;
  }
  const hosts = [...new Set([...(lab.hosts || []), ...(lab.iconHosts || [])])];
  for (const url of lab.icons || []) {
    if (!hostAllowed(url, hosts)) continue;
    try {
      const res = await fetchIcon(url, hosts);
      const type = res.headers.get("content-type") || "";
      const buf = Buffer.from(await res.arrayBuffer());
      if (!looksLikeMark(buf, type)) continue;
      const ext = extFrom(url, type);
      await writeFile(join(MARK_DIR, lab.id + ext), buf);
      await pruneOtherExts(lab, ext);
      await writeFile(srcPath(lab), url);
      return "/marks/" + lab.id + ext;
    } catch {
      /* next official icon */
    }
  }
  // Every configured source failed. The curated seed beats a stale cached
  // mark — the cache only holds a mark from an icon list we have since replaced,
  // while the seed is the official mark captured into the repo, so the site never
  // depends on any single host being reachable.
  const seed = SEED_MARKS[lab.id];
  if (seed?.b64) {
    const buf = Buffer.from(String(seed.b64).replace(/\s+/g, ""), "base64");
    if (looksLikeMark(buf, "image/" + seed.ext.slice(1))) {
      await writeFile(join(MARK_DIR, lab.id + seed.ext), buf);
      await pruneOtherExts(lab, seed.ext);
      return "/marks/" + lab.id + seed.ext;
    }
  }
  // No seed either. A stale cached mark still beats the house glyph.
  if (stale) return "/marks/" + lab.id + stale;
  const svg = houseSvg(lab.id);
  await writeFile(join(MARK_DIR, lab.id + ".svg"), svg);
  return "/marks/" + lab.id + ".svg";
}
