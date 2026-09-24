import { access, mkdir, readFile, writeFile } from "node:fs/promises";
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

function isHouseSvg(buf) {
  return buf.slice(0, 400).toString("utf8").includes("<svg") && buf.length < 800;
}

export async function fetchMark(lab) {
  await mkdir(MARK_DIR, { recursive: true });
  // Vector first, to match collectMarks(): a cached .svg is the best mark we
  // have, and a stale raster from an older icon list must never shadow it.
  for (const ext of [".svg", ".png", ".ico", ".webp", ".jpg"]) {
    const cached = join(MARK_DIR, lab.id + ext);
    if (!(await exists(cached))) continue;
    const buf = await readFile(cached);
    if (isHouseSvg(buf)) continue;
    if (looksLikeMark(buf, ext === ".svg" ? "image/svg+xml" : "image/" + ext.slice(1))) {
      return "/marks/" + lab.id + ext;
    }
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
      return "/marks/" + lab.id + ext;
    } catch {
      /* next official icon */
    }
  }
  const seed = SEED_MARKS[lab.id];
  if (seed?.b64) {
    const buf = Buffer.from(String(seed.b64).replace(/\s+/g, ""), "base64");
    if (looksLikeMark(buf, "image/" + seed.ext.slice(1))) {
      await writeFile(join(MARK_DIR, lab.id + seed.ext), buf);
      return "/marks/" + lab.id + seed.ext;
    }
  }
  const svg = houseSvg(lab.id);
  await writeFile(join(MARK_DIR, lab.id + ".svg"), svg);
  return "/marks/" + lab.id + ".svg";
}
