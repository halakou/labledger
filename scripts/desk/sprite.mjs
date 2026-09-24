// Build a single SVG sprite from every fetched mark. All marks are embedded,
// so the whole board costs ONE request instead of one request per logo.
//
// Why the re-encode: sources ship .ico/.jpg/.webp/.png at odd sizes, and SVG
// <image> only reliably renders PNG data URIs (ICO renders broken in most
// engines). PNG marks are re-encoded to a square 96x96 RGBA PNG here, using a
// hand-rolled PNG decoder + encoder — the project has zero native deps,
// deliberately, so no sharp/libpng.
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { deflateSync, inflateSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { MARK_DIR, OUT } from "./core.mjs";

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

// ---- minimal PNG codec ---------------------------------------------------
function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c & 1 ? 0xedb88320 : 0) ^ (c >>> 1);
  }
  return (~c) >>> 0;
}
function chunk(type, data) {
  const t = Buffer.from(type, "ascii");
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([t, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function encodePng(w, h, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  const raw = Buffer.alloc((w * 4 + 1) * h);
  let o = 0;
  for (let y = 0; y < h; y++) {
    raw[o++] = 0; // filter: none
    rgba.copy(raw, o, y * w * 4, (y + 1) * w * 4);
    o += w * 4;
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// Undo PNG filters and return raw RGBA. Handles palette, RGB, and RGBA at
// 8- and 16-bit depth; anything else returns null.
function decodePng(buf, w, h, colorType) {
  const bitDepth = buf[24];
  if (bitDepth !== 8 && bitDepth !== 16) return null;
  if (colorType !== 2 && colorType !== 6 && colorType !== 3) return null; // RGB, RGBA, palette
  let idat = Buffer.alloc(0);
  let pal = Buffer.alloc(0);
  let trns = Buffer.alloc(0);
  let at = 8;
  while (at < buf.length - 8) {
    const len = buf.readUInt32BE(at);
    const type = buf.toString("ascii", at + 4, at + 8);
    if (type === "IDAT") idat = Buffer.concat([idat, buf.subarray(at + 8, at + 8 + len)]);
    else if (type === "PLTE") pal = buf.subarray(at + 8, at + 8 + len);
    else if (type === "tRNS") trns = buf.subarray(at + 8, at + 8 + len);
    if (type === "IEND") break;
    at += 12 + len;
  }
  let raw;
  try {
    raw = inflateSync(idat);
  } catch {
    return null;
  }
  // 16-bit channels carry one extra byte per sample; we keep only the high
  // byte of each, which is the correct 8-bit value.
  const expand = bitDepth === 16;
  // Palette images: one index byte per pixel, expanded to RGBA via PLTE/tRNS.
  if (colorType === 3) {
    if (pal.length === 0) return null;
    const out = Buffer.alloc(w * h * 4);
    const stride = w * (expand ? 2 : 1);
    let prev = Buffer.alloc(stride);
    let o = 0;
    for (let y = 0; y < h; y++) {
      const f = raw[o++];
      const cur = Buffer.from(raw.subarray(o, o + stride));
      o += stride;
      if (f === 1) for (let x = 1; x < stride; x++) cur[x] = (cur[x] + cur[x - 1]) & 0xff;
      else if (f === 2) for (let x = 0; x < stride; x++) cur[x] = (cur[x] + prev[x]) & 0xff;
      else if (f === 3) for (let x = 0; x < stride; x++) cur[x] = (cur[x] + ((cur[x - 1] + prev[x]) >> 1)) & 0xff;
      else if (f === 4) {
        for (let x = 0; x < stride; x++) {
          const a = x ? cur[x - 1] : 0;
          const b = prev[x];
          const c = x ? prev[x - 1] : 0;
          const p = a + b - c;
          const pa = Math.abs(p - a),
            pb = Math.abs(p - b),
            pc = Math.abs(p - c);
          cur[x] = (cur[x] + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 0xff;
        }
      }
      for (let x = 0; x < w; x++) {
        const idx = (cur[x * (expand ? 2 : 1)] * 3);
        const di = (y * w + x) * 4;
        out[di] = pal[idx];
        out[di + 1] = pal[idx + 1];
        out[di + 2] = pal[idx + 2];
        out[di + 3] = cur[x * (expand ? 2 : 1)] < trns.length ? trns[cur[x * (expand ? 2 : 1)]] : 255;
      }
      prev = Buffer.from(cur);
    }
    return out;
  }
  const ch = colorType === 6 ? 4 : 3;
  const stride = w * ch * (expand ? 2 : 1);
  const out = Buffer.alloc(w * h * 4);
  let prev = Buffer.alloc(stride);
  let o = 0;
  for (let y = 0; y < h; y++) {
    const f = raw[o++];
    const cur = Buffer.from(raw.subarray(o, o + stride));
    o += stride;
    if (f === 1) for (let x = ch; x < stride; x++) cur[x] = (cur[x] + cur[x - ch]) & 0xff;
    else if (f === 2) for (let x = 0; x < stride; x++) cur[x] = (cur[x] + prev[x]) & 0xff;
    else if (f === 3)
      for (let x = 0; x < stride; x++) cur[x] = (cur[x] + ((cur[x - ch] + prev[x]) >> 1)) & 0xff;
    else if (f === 4) {
      for (let x = 0; x < stride; x++) {
        const a = x >= ch ? cur[x - ch] : 0;
        const b = prev[x];
        const c = x >= ch ? prev[x - ch] : 0;
        const p = a + b - c;
        const pa = Math.abs(p - a),
          pb = Math.abs(p - b),
          pc = Math.abs(p - c);
        cur[x] = (cur[x] + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 0xff;
      }
    }
    // RGB → RGBA (opaque), RGBA → RGBA (copy). 16-bit samples keep only the
    // high byte.
    const step = expand ? 2 : 1;
    for (let x = 0; x < w; x++) {
      const si = x * ch * step;
      const di = x * 4;
      out[y * w * 4 + di] = cur[si];
      out[y * w * 4 + di + 1] = cur[si + step];
      out[y * w * 4 + di + 2] = cur[si + 2 * step];
      out[y * w * 4 + di + 3] = ch === 4 ? cur[si + 3 * step] : 255;
    }
    prev = Buffer.from(cur);
  }
  return out;
}

// ICO files: a header listing image entries, each holding either a BMP or a
// PNG. We prefer the largest PNG entry (already alpha-safe); otherwise we
// decode the largest BMP entry ourselves, including its AND-mask transparency.
function icoToRgba(buf) {
  if (buf.length < 6 || buf.readUInt16LE(0) !== 0 || buf.readUInt16LE(2) !== 1) return null;
  const count = buf.readUInt16LE(4);
  let bestPng = null;
  let bestBmp = null;
  for (let i = 0; i < count; i++) {
    const base = 6 + i * 16;
    if (base + 16 > buf.length) break;
    const w = buf[base] === 0 ? 256 : buf[base];
    const h = buf[base + 1] === 0 ? 256 : buf[base + 1];
    const size = buf.readUInt32LE(base + 8);
    const off = buf.readUInt32LE(base + 12);
    if (off + size > buf.length) continue;
    const data = buf.subarray(off, off + size);
    const area = w * h;
    if (data.length >= 8 && data[0] === 0x89 && data[1] === 0x50) {
      if (!bestPng || area > bestPng.area) bestPng = { area, data };
    } else if (data.length >= 40) {
      if (!bestBmp || area > bestBmp.area) bestBmp = { area, data, w, h };
    }
  }
  if (bestPng) {
    // Normalize through the shared PNG path.
    return normalizePngToRgba(bestPng.data);
  }
  if (bestBmp) return decodeIcoBmp(bestBmp.data, bestBmp.w, bestBmp.h);
  return null;
}

// The shared PNG decode + square-to-RGBA path, split out so ICO can reuse it.
function normalizePngToRgba(buf) {
  if (buf.length < 33 || buf[0] !== 0x89 || buf[1] !== 0x50) return null;
  const w = buf.readUInt32BE(16);
  const h = buf.readUInt32BE(20);
  if (w === 0 || w > 4096 || h === 0 || h > 4096) return null;
  const colorType = buf[25];
  const rgba = decodePng(buf, w, h, colorType);
  if (!rgba) return null;
  const c = autocrop(rgba, w, h);
  return squareToRgba(c.rgba, c.w, c.h);
}

// ICO BMP entries: 40-byte BITMAPINFOHEADER, bottom-up pixel rows, then a
// 1bpp AND mask that carries transparency (1 = transparent). Supports 32/24
// bit truecolor plus 8/4-bit palette images.
function decodeIcoBmp(data, w, h) {
  const headerSize = data.readUInt32LE(0);
  if (headerSize < 40 || data.length < headerSize + 8) return null;
  const bpp = data.readUInt16LE(14);
  if (bpp !== 32 && bpp !== 24 && bpp !== 8 && bpp !== 4) return null;
  // In an ICO, biHeight counts color rows + mask rows, so halve it.
  const dibH = data.readInt32LE(8);
  const imgH = dibH > 0 ? dibH >> 1 : h;
  const ch = bpp === 32 ? 4 : 3;
  const pixPerPack = bpp === 4 ? 2 : bpp === 8 ? 1 : 0;
  const stride = pixPerPack ? ((w + pixPerPack - 1) / pixPerPack + 3) & ~3 : (w * ch + 3) & ~3;
  // Palette for 8/4bpp: biClrUsed BGRA quads follow the header. biClrUsed of
  // 0 means the full 2^bpp range.
  const clrUsed = data.readUInt32LE(32);
  const palBytes = (clrUsed || (1 << bpp)) * 4;
  const pixOff = bpp === 32 || bpp === 24 ? headerSize : headerSize + palBytes;
  const andStride = (w + 7) >> 3;
  const andOff = pixOff + stride * imgH;
  if (data.length < andOff + andStride * imgH) return null;
  // Palette for 8/4bpp: BGRA quads right after the header.
  const pal = bpp === 32 || bpp === 24 ? null : data.subarray(headerSize, pixOff);
  const rgba = Buffer.alloc(w * imgH * 4);
  for (let y = 0; y < imgH; y++) {
    const srcY = imgH - 1 - y; // bottom-up
    const rowOff = pixOff + srcY * stride;
    const andRow = andOff + srcY * andStride;
    for (let x = 0; x < w; x++) {
      const di = (y * w + x) * 4;
      if (pal) {
        let idx;
        if (bpp === 8) idx = data[rowOff + x];
        else {
          const byte = data[rowOff + (x >> 1)];
          idx = (x & 1) === 0 ? (byte >> 4) & 0xf : byte & 0xf;
        }
        const p = idx * 4;
        rgba[di] = pal[p + 2]; // BGR → RGB
        rgba[di + 1] = pal[p + 1];
        rgba[di + 2] = pal[p];
        rgba[di + 3] = 255;
      } else {
        const si = rowOff + x * ch;
        rgba[di] = data[si + 2]; // BGR → RGB
        rgba[di + 1] = data[si + 1];
        rgba[di + 2] = data[si];
        rgba[di + 3] = bpp === 32 ? data[si + 3] : 255;
      }
      // The AND mask wins over the pixel's own alpha.
      const maskBit = (data[andRow + (x >> 3)] >> (7 - (x & 7))) & 1;
      if (maskBit) rgba[di + 3] = 0;
    }
  }
  const c = autocrop(rgba, w, imgH);
  return squareToRgba(c.rgba, c.w, c.h);
}

// Trim the transparent margins around a raster so the logo fills the tile
// instead of shrinking into a corner. Many favicons and GitHub avatars ship
// with dead canvas (MIT Technology Review's 256px icon carries a 96px logo in
// its top-left corner; centering that canvas makes the mark a quarter-size
// speck in the corner). Returns { rgba, w, h }; when nothing can be cropped
// the input is returned unchanged with its original dimensions.
function autocrop(rgba, w, h) {
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (rgba[(y * w + x) * 4 + 3] > 8) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return { rgba, w, h }; // fully transparent — leave it alone
  const cw = maxX - minX + 1;
  const ch = maxY - minY + 1;
  // Don't crop a logo that already fills its canvas — the copy would be a
  // waste and, worse, would strip a deliberately full-bleed ground.
  if (cw >= w - 1 && ch >= h - 1) return { rgba, w, h };
  const out = Buffer.alloc(cw * ch * 4);
  for (let y = 0; y < ch; y++) {
    rgba.copy(out, y * cw * 4, ((y + minY) * w + minX) * 4, ((y + minY) * w + minX + cw) * 4);
  }
  return { rgba: out, w: cw, h: ch };
}

// Center a w×h RGBA buffer on a transparent square and box-filter it to 96.
function squareToRgba(rgba, w, h) {
  const side = Math.max(w, h);
  const ox = (side - w) >> 1;
  const oy = (side - h) >> 1;
  const pad = Buffer.alloc(side * side * 4, 0);
  for (let y = 0; y < h; y++) {
    rgba.copy(pad, ((y + oy) * side + ox) * 4, y * w * 4, (y + 1) * w * 4);
  }
  const out = Buffer.alloc(96 * 96 * 4);
  const sw = side / 96;
  const sh = side / 96;
  for (let y = 0; y < 96; y++) {
    const y0 = Math.floor(y * sh);
    const y1 = Math.max(y0 + 1, Math.floor((y + 1) * sh));
    for (let x = 0; x < 96; x++) {
      const x0 = Math.floor(x * sw);
      const x1 = Math.max(x0 + 1, Math.floor((x + 1) * sw));
      // Premultiplied box average: colors are weighted by coverage so a
      // half-transparent pixel contributes half its color.
      let r = 0, g = 0, b = 0, wsum = 0, a = 0, n = 0;
      for (let sy = y0; sy < y1 && sy < side; sy++) {
        for (let sx = x0; sx < x1 && sx < side; sx++) {
          const si = (sy * side + sx) * 4;
          const wa = pad[si + 3] / 255;
          r += pad[si] * wa;
          g += pad[si + 1] * wa;
          b += pad[si + 2] * wa;
          wsum += wa;
          a += pad[si + 3];
          n++;
        }
      }
      const di = (y * 96 + x) * 4;
      out[di] = wsum > 0 ? Math.round(r / wsum) : 0;
      out[di + 1] = wsum > 0 ? Math.round(g / wsum) : 0;
      out[di + 2] = wsum > 0 ? Math.round(b / wsum) : 0;
      out[di + 3] = Math.round(a / n);
    }
  }
  return out;
}



// Share of an RGBA buffer's opaque pixels that are dark vs light. A logo with
// meaningful amounts of both is bichromatic — a white wordmark on a navy
// square, a gradient from dark to light — and no single-tone tile can carry
// it. Returns null when there is nothing opaque to measure.
function inkStats(rgba) {
  let dark = 0;
  let light = 0;
  let n = 0;
  for (let i = 0; i < rgba.length; i += 4) {
    if (rgba[i + 3] < 220) continue;
    const lum = 0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2];
    if (lum < 90) dark++;
    else if (lum > 170) light++;
    n++;
  }
  if (!n) return null;
  return { dark: dark / n, light: light / n };
}

// Luminance of a normalized raster. Only opaque pixels count, so a logo that
// is mostly transparent does not read as "dark" just because it sits on a
// transparent square. Returns null when there is nothing opaque to measure.
function rasterLuminance(rgba) {
  let sum = 0;
  let n = 0;
  for (let i = 0; i < rgba.length; i += 4) {
    if (rgba[i + 3] < 128) continue;
    sum += 0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2];
    n++;
  }
  return n ? sum / n : null;
}

// Vector marks are inlined so they keep scaling at any size. The source SVG
// may live in any coordinate space (the Hugging Face logo is 95x88 with no
// viewBox at all, PyTorch's is offset to y=1067), so the symbol's viewBox must
// be derived from the source instead of assumed — otherwise the paths render
// far outside the 32x32 tile and the mark arrives clipped and "exploded".
function sourceViewBox(raw, inner) {
  const vb = raw.match(/viewBox\s*=\s*"([^"]+)"/);
  if (vb) {
    const p = vb[1].trim().split(/[\s,]+/).map(Number);
    if (p.length === 4 && p.every(Number.isFinite) && p[2] > 0 && p[3] > 0) return p;
  }
  const w = raw.match(/\bwidth\s*=\s*"([\d.]+)"/);
  const h = raw.match(/\bheight\s*=\s*"([\d.]+)"/);
  if (w && h) {
    const ww = Number(w[1]);
    const hh = Number(h[1]);
    if (ww > 0 && hh > 0 && Number.isFinite(ww) && Number.isFinite(hh)) return [0, 0, ww, hh];
  }
  // Fall back to the coordinate range actually used by the paths.
  const nums = [...inner.matchAll(/[-+]?\d*\.?\d+(?=[\s,)\]])/g)].map((m) => Number(m[0]));
  if (nums.length) {
    const x = Math.min(...nums);
    const y = Math.min(...nums);
    const w2 = Math.max(...nums) - x;
    return [x, y, w2, w2];
  }
  return null;
}

// Extract the drawable content of a standalone SVG: the elements inside its
// root <svg> tag, with the declaration and the root itself discarded. The
// tricky part is that a downloaded SVG can carry a <!DOCTYPE svg ...> in its
// head, and its root tag can contain a nested <svg> inside a comment. We slice
// from the *first <svg element after any declarations* to the last </svg>, then
// additionally drop any nested <svg> elements left in the body.
function extractSvgInner(raw) {
  // Strip the XML prolog and DOCTYPE (a stray <!DOCTYPE inside an XML body is
  // an illegal character and makes the browser reject the whole sprite).
  let body = raw.replace(/<\?xml[\s\S]*?\?>/g, "").replace(/<!DOCTYPE[\s\S]*?>/gi, "").replace(/<!--[\s\S]*?-->/g, "");
  // The root element starts at the first "<svg" followed by ">" or whitespace.
  const startTag = body.search(/<svg[\s>]/i);
  if (startTag < 0) return { inner: "", viewBox: null };
  const tagEnd = body.indexOf(">", startTag);
  if (tagEnd < 0) return { inner: "", viewBox: null };
  const attrs = body.slice(startTag + 4, tagEnd);
  const end = body.lastIndexOf("</svg>");
  if (end < 0) return { inner: "", viewBox: null };
  let inner = body.slice(tagEnd + 1, end);
  // A nested <svg> is not allowed inside a <symbol> root — remove the wrapper
  // but keep its children so the paths still draw.
  inner = inner.replace(/<svg[\s\S]*?>/gi, "").replace(/<\/svg>/gi, "");
  const vbm = attrs.match(/viewBox="([^"]+)"/i);
  // Icon packs (Simple Icons, Tabler) put the ink color on the root element.
  // The root is discarded below, so the color is handed to the caller, which
  // re-attaches it as a group on the way into the symbol.
  const rootFill = (attrs.match(/\bfill="([^"]+)"/i) || [])[1] || null;
  const rootStroke = (attrs.match(/\bstroke="([^"]+)"/i) || [])[1] || null;
  return { inner, viewBox: vbm ? vbm[1].trim() : null, rootFill, rootStroke };
}

// viewBox from an explicit declaration ("0.6 1067.9 90.3 109.1"), or null.
function viewBoxFromList(p) {
  if (p.length === 4 && p.every(Number.isFinite) && p[2] > 0 && p[3] > 0) return p;
  return null;
}

// viewBox from the width/height attrs of the root, else from the coordinate
// range actually used by the paths inside the body.
function pathViewBox(inner, raw) {
  if (raw) {
    const w = raw.match(/\bwidth\s*=\s*"([\d.]+)"/);
    const h = raw.match(/\bheight\s*=\s*"([\d.]+)"/);
    if (w && h) {
      const ww = Number(w[1]);
      const hh = Number(h[1]);
      if (ww > 0 && hh > 0 && Number.isFinite(ww) && Number.isFinite(hh)) return [0, 0, ww, hh];
    }
  }
  const nums = [...inner.matchAll(/[-+]?\d*\.?\d+(?=[\s,)\]])/g)].map((m) => Number(m[0]));
  if (nums.length) {
    const x = Math.min(...nums);
    const y = Math.min(...nums);
    const w2 = Math.max(...nums) - x;
    return [x, y, w2, w2];
  }
  return null;
}

// Illustrator/Inkscape SVGs declare fills in a <style> block (eg `.st0{fill:#76B900}`)
// instead of per-element attributes. Two things break when such an SVG is nested
// inside a <symbol> and referenced with <use>: the class rules are not reliably
// applied by every engine, and vectorTile() cannot see them, so the mark ends
// up with no contrasting tile and invisible ink in dark mode. Move each class
// fill onto its element as a fill attribute and drop the <style> block.
function inlineStyleFills(inner) {
  const block = inner.match(/<style\b[^>]*>([\s\S]*?)<\/style>/i);
  if (!block) return inner;
  const rules = new Map();
  for (const r of block[1].matchAll(/\.([A-Za-z0-9_-]+)\s*\{([^}]*)\}/g)) {
    const fill = r[2].match(/fill\s*:\s*(#[0-9a-fA-F]{3,8}|[a-zA-Z]+)\s*(?:;|$|\s)/);
    if (fill) rules.set(r[1], fill[1]);
  }
  const out = inner.replace(/<style\b[^>]*>[\s\S]*?<\/style>/i, "");
  if (!rules.size) return out;
  // Walk element tags so a fill is only added where the element does not already
  // carry one — a duplicate fill attribute would make the document invalid XML.
  return out.replace(/<([A-Za-z][\w:-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g, (tag, name, attrs) => {
    const cls = attrs.match(/class="([^"]*)"/);
    if (!cls) return tag;
    let fill = null;
    for (const c of cls[1].trim().split(/\s+/)) {
      if (rules.has(c)) { fill = rules.get(c); break; }
    }
    if (!fill || /\bfill\s*=/.test(attrs)) return tag;
    const at = attrs.indexOf("class=");
    return "<" + name + attrs.slice(0, at + cls[0].length) + ' fill="' + fill + '"' + attrs.slice(at + cls[0].length) + ">";
  });
}

function symbolForSvg(id, buf) {
  const raw = buf.toString("utf8");
  const { inner, viewBox: declared, rootFill, rootStroke } = extractSvgInner(raw);
  const vb = declared ? viewBoxFromList(declared.split(/[\s,]+/).map(Number)) : pathViewBox(inner, raw);
  if (!vb) return null; // nothing usable — caller falls back to a letter mark
  let drawn = inlineStyleFills(inner);
  const groupAttrs = [];
  if (rootFill && rootFill !== "none") groupAttrs.push('fill="' + rootFill + '"');
  if (rootStroke && rootStroke !== "none") groupAttrs.push('stroke="' + rootStroke + '"');
  if (groupAttrs.length) drawn = "<g " + groupAttrs.join(" ") + ">" + drawn + "</g>";
  const tile = vectorTile(drawn);
  const bg = tile ? '<rect x="' + vb[0] + '" y="' + vb[1] + '" width="' + vb[2] + '" height="' + vb[3] + '" fill="' + tile + '"/>' : "";
  return '<symbol id="m-' + id + '" viewBox="' + vb.join(" ") + '">' + bg + drawn + "</symbol>";
}

// The tile that sits behind every mark. Both colors are from the desk
// palette: cream in light mode, warm near-black in dark mode. The glyph tile
// is what actually shows behind the logo, so its color is what the logo has to
// contrast against — not the outer .mark color.
const TILE = {
  light: "#fffaf2",
  dark: "#241f18",
  // A neutral warm grey that carries both dark and light ink. Sits between
  // the light paper (#f4efe4) and the dark paper (#16130e) so it never looks
  // foreign in either theme.
  mid: "#7d7463",
};

// Pick the tile a logo can be seen on. A light logo gets the dark tile and a
// dark logo gets the light one, so every mark is legible in BOTH light and
// dark mode without any per-logo special-casing.
//
// The tile is baked into the sprite <symbol> as an opaque <rect>, and the CSS
// .glyph background is transparent so the sprite's own tile shows through.
// That is what makes a logo legible in both themes: the tile is chosen for the
// logo, not for the theme.
//
// A bichromatic logo (dark AND light ink, like BAIR's white wordmark on navy,
// or DeepSpeed's gradient) is the hard case: a light tile hides the light ink
// and a dark tile hides the dark ink. It gets a neutral mid-tone tile instead,
// which carries both. The mid-tone is a warm grey from the desk palette so it
// still reads as part of the site in either theme.
export function tileForLuminance(lum, ink) {
  if (lum === null || lum === undefined) return null;
  if (ink && ink.dark > 0.08 && ink.light > 0.08) return TILE.mid;
  return lum >= 150 ? TILE.dark : TILE.light;
}

// Many official logos arrive with an opaque background baked in (favicon ICOs,
// JPEG exports). Left alone, that square covers the site's own tile and shows
// as a foreign cream box in dark mode. The corner color is read and keyed to
// transparency instead, so the site's tile shows through behind the glyph and
// the tile can flip with the theme. The key is only applied when the result
// still leaves a recognizable mark: a key that would eat most of the logo is
// skipped (the logo keeps its own ground, as it was designed).
function keyBackground(rgba, w, h) {
  const i = (x, y) => (y * w + x) * 4;
  const key = [rgba[i(2, 2)], rgba[i(2, 2) + 1], rgba[i(2, 2) + 2]];
  let kept = 0;
  let removed = 0;
  const out = new Uint8Array(rgba.length);
  for (let p = 0; p < rgba.length; p += 4) {
    const a = rgba[p + 3];
    if (a < 200) continue;
    const d =
      Math.abs(rgba[p] - key[0]) +
      Math.abs(rgba[p + 1] - key[1]) +
      Math.abs(rgba[p + 2] - key[2]);
    if (d < 36) {
      removed++;
    } else {
      out[p] = rgba[p];
      out[p + 1] = rgba[p + 1];
      out[p + 2] = rgba[p + 2];
      out[p + 3] = a;
      kept++;
    }
  }
  // Skip the key when it would erase the logo itself. Those logos are drawn
  // on their own ground (BAIR on navy, WIRED on black), so the ground stays
  // and the tile must match it — a contrasting tile behind a logo that keeps
  // its own background would frame it in a foreign square.
  if (kept < 150 || kept < removed * 0.35) {
    const r = key[0].toString(16).padStart(2, "0");
    const g = key[1].toString(16).padStart(2, "0");
    const b = key[2].toString(16).padStart(2, "0");
    return { skipped: "#" + r + g + b };
  }
  return out;
}

// Normalize a raster to a square 96x96 RGBA *and* report its luminance. The
// tile behind the logo is chosen from that luminance so the logo stays legible
// in both light and dark mode. Returns { png, lum } or null when we cannot
// decode the format (the caller then embeds the original bytes raw).
function normalizeRasterWithLum(buf) {
  const rgba = rasterToRgba(buf);
  if (!rgba) return null;
  const keyed = keyBackground(rgba, 96, 96);
  if (keyed && keyed.skipped) {
    // The logo keeps its own ground, so the tile matches it and becomes
    // invisible; the luminance of the logo's opaque pixels is what decides
    // whether the mark reads dark or light.
    return { png: encodePng(96, 96, rgba), lum: rasterLuminance(rgba), ink: inkStats(rgba), ground: keyed.skipped };
  }
  const final = keyed ? Buffer.from(keyed) : rgba;
  return { png: encodePng(96, 96, final), lum: rasterLuminance(final), ink: inkStats(final) };
}

// Luminance of raw bytes we could not decode (JPEG/WebP). We cannot decode
// these to RGBA, but the byte histogram still tells us whether the image is
// mostly light or mostly dark: count how many bytes sit in the low vs high
// half of the range. This is a rough estimate, but it is enough to pick a
// tile the logo can be seen on.
function rawLuminance(buf) {
  let dark = 0;
  let light = 0;
  // Sample at most 64k bytes to keep it cheap.
  const step = Math.max(1, Math.floor(buf.length / 65536));
  for (let i = 0; i < buf.length; i += step) {
    const b = buf[i];
    if (b < 90) dark++;
    else if (b > 180) light++;
  }
  if (!dark && !light) return null;
  // A JPEG of a dark logo has many more low bytes than high bytes.
  return dark > light ? 60 : 200;
}

// Decode ICO/PNG/etc. to a normalized 96x96 RGBA buffer, or null.
function rasterToRgba(buf) {
  if (buf.length >= 6 && buf.readUInt16LE(0) === 0 && buf.readUInt16LE(2) === 1) {
    return icoToRgba(buf);
  }
  if (buf.length < 33 || buf[0] !== 0x89 || buf[1] !== 0x50) return null;
  const w = buf.readUInt32BE(16);
  const h = buf.readUInt32BE(20);
  if (w === 0 || w > 4096 || h === 0 || h > 4096) return null; // not a real PNG
  const colorType = buf[25];
  let rgba = decodePng(buf, w, h, colorType);
  if (!rgba) return null;
  const c = autocrop(rgba, w, h);
  return squareToRgba(c.rgba, c.w, c.h);
}

function symbolForRaster(id, ext, buf) {
  // Square everything to 96x96 PNG. ICO files carry embedded PNGs which we
  // extract first; anything we cannot re-encode is embedded raw so the
  // sprite still costs one request. The mime is read from the file's magic
  // bytes, not its extension: the extension comes from the URL we fetched,
  // and a host can hand a .png path containing JPEG bytes.
  const norm = ext === ".png" || ext === ".ico" ? normalizeRasterWithLum(buf) : null;
  const isJpeg = buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8;
  const mime = norm
    ? "image/png"
    : isJpeg
      ? "image/jpeg"
      : ext === ".webp"
        ? "image/webp"
        : ext === ".jpg" || ext === ".jpeg"
          ? "image/jpeg"
          : "image/png";
  const finalBuf = norm ? norm.png : buf;
  // Paint the tile into the symbol itself so the logo always sits on a color
  // it contrasts with, in both light and dark mode. The CSS .glyph color is
  // then just the fallback for marks we could not measure.
  let tile = norm ? (norm.ground || tileForLuminance(norm.lum, norm.ink)) : null;
  if (!tile && ext !== ".svg") tile = tileForLuminance(rawLuminance(buf));
  const vb = "0 0 96 96";
  const bg = tile ? '<rect width="96" height="96" fill="' + tile + '"/>' : "";
  return (
    '<symbol id="m-' +
    id +
    '" viewBox="' +
    vb +
    '">' +
    bg +
    '<image href="data:' +
    mime +
    ";base64," +
    finalBuf.toString("base64") +
    '" width="96" height="96"/></symbol>'
  );
}

async function collectMarks(ids) {
  const out = [];
  for (const id of ids) {
    for (const ext of [".svg", ".png", ".ico", ".webp", ".jpg"]) {
      const p = join(MARK_DIR, id + ext);
      if (await exists(p)) {
        out.push({ id, ext, buf: await readFile(p) });
        break;
      }
    }
  }
  return out;
}

// Build /sprite.svg from every mark the board uses. Marks that are plain SVG
// are inlined as vector paths; raster marks are normalized to square PNG and
// embedded as data URIs. Every symbol also paints its own background tile, so
// a light logo sits on the dark tile and a dark logo on the light one — each
// mark stays legible in both light and dark mode. Returns the public path so
// markHtml can reference it.
export async function writeMarkSprite(markIds) {
  const marks = await collectMarks(markIds);
  if (!marks.length) return null;
  const parts = ['<svg xmlns="http://www.w3.org/2000/svg" style="display:none">'];
  const usable = [];
  for (const m of marks) {
    // An SVG we cannot map to a coordinate space is dropped, not mangled: the
    // caller's letter fallback then shows a clean mark instead of a clipped one.
    const sym = m.ext === ".svg" ? symbolForSvg(m.id, m.buf) : symbolForRaster(m.id, m.ext, m.buf);
    if (sym) usable.push(sym);
  }
  if (!usable.length) return null;
  parts.push(...usable);
  parts.push("</svg>");
  await mkdir(OUT, { recursive: true });
  const path = join(OUT, "sprite.svg");
  await writeFile(path, parts.join(""));
  return "/sprite.svg";
}

// Vector marks are single-color paths drawn by us, so the tile is read from the
// SVG's own fill/stroke. Raster marks are measured after normalization.
// A vector logo with ANY dark fill is designed to sit on a light ground (its
// dark features would vanish on the dark tile), so only logos that are light
// throughout get the dark tile. Averaging the fills instead made bichromatic
// marks like Hugging Face's (dark face on a yellow head) pick the dark tile
// and arrive with an invisible face.
function vectorTile(raw) {
  const tones = raw.match(/(?:fill|stroke)="#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})"/g) || [];
  if (!tones.length) return null;
  let darkest = 255;
  let lightest = 0;
  let sum = 0;
  for (const t of tones) {
    const hex = t.slice(t.indexOf("#") + 1, -1);
    const full = hex.length === 3 ? hex.split("").map((c) => c + c).join("") : hex;
    const r = parseInt(full.slice(0, 2), 16);
    const g = parseInt(full.slice(2, 4), 16);
    const b = parseInt(full.slice(4, 6), 16);
    const lum = 0. * 0 + 0.299 * r + 0.587 * g + 0.114 * b;
    darkest = Math.min(darkest, lum);
    lightest = Math.max(lightest, lum);
    sum += lum;
  }
  const mean = sum / tones.length;
  // A logo carrying both dark and light tones is drawn on a light ground.
  if (darkest < 90 && lightest > 170) return TILE.light;
  return tileForLuminance(mean);
}
