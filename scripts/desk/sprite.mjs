// Build a single SVG sprite from every fetched mark. All marks are embedded,
// so the whole board costs ONE request instead of one request per logo.
//
// Why the re-encode: sources ship .ico/.jpg/.webp/.png at odd sizes, and SVG
// <image> only reliably renders PNG data URIs (ICO renders broken in most
// engines). PNG marks are re-encoded to a square 96x96 RGBA PNG here, using a
// hand-rolled PNG decoder + encoder — the project has zero native deps,
// deliberately, so no sharp/libpng.
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { deflateSync, inflateSync } from "node:zlib";
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
  return squareToRgba(rgba, w, h);
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
  return squareToRgba(rgba, w, imgH);
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

// Normalize any raster we support to a square 96x96 RGBA PNG. Returns a
// Buffer of PNG bytes, or null if we cannot handle the format (the caller
// then embeds the original bytes so the sprite still costs one request).
function normalizeRaster(buf) {
  // ICO: extract the largest entry (PNG preferred, BMP decoded with its
  // AND-mask transparency).
  if (buf.length >= 6 && buf.readUInt16LE(0) === 0 && buf.readUInt16LE(2) === 1) {
    const rgba = icoToRgba(buf);
    return rgba ? encodePng(96, 96, rgba) : null;
  }
  if (buf.length < 33 || buf[0] !== 0x89 || buf[1] !== 0x50) return null;
  const w = buf.readUInt32BE(16);
  const h = buf.readUInt32BE(20);
  if (w === 0 || w > 4096 || h === 0 || h > 4096) return null; // not a real PNG
  const colorType = buf[25];
  const rgba = decodePng(buf, w, h, colorType);
  if (!rgba) return null;
  return encodePng(96, 96, squareToRgba(rgba, w, h));
}

// Vector marks are inlined so they keep scaling at any size.
function symbolForSvg(id, buf) {
  const raw = buf.toString("utf8");
  const inner = raw.includes(">")
    ? raw.slice(raw.indexOf(">") + 1, raw.lastIndexOf("</svg>"))
    : "";
  return '<symbol id="m-' + id + '" viewBox="0 0 32 32">' + inner + "</symbol>";
}

function symbolForRaster(id, ext, buf) {
  // Square everything to 96x96 PNG. ICO files carry embedded PNGs which we
  // extract first; anything we cannot re-encode is embedded raw so the
  // sprite still costs one request.
  const norm = ext === ".png" || ext === ".ico" ? normalizeRaster(buf) : null;
  const mime = norm ? "image/png" : ext === ".webp" ? "image/webp" : ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : "image/png";
  const finalBuf = norm || buf;
  return (
    '<symbol id="m-' +
    id +
    '" viewBox="0 0 96 96"><image href="data:' +
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
// embedded as data URIs. Returns the public path so markHtml can reference it.
export async function writeMarkSprite(markIds) {
  const marks = await collectMarks(markIds);
  if (!marks.length) return null;
  const parts = ['<svg xmlns="http://www.w3.org/2000/svg" style="display:none">'];
  for (const m of marks) {
    parts.push(m.ext === ".svg" ? symbolForSvg(m.id, m.buf) : symbolForRaster(m.id, m.ext, m.buf));
  }
  parts.push("</svg>");
  await mkdir(OUT, { recursive: true });
  const path = join(OUT, "sprite.svg");
  await writeFile(path, parts.join(""));
  return "/sprite.svg";
}
