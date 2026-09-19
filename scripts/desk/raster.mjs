import { inflateSync } from "node:zlib";

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

export function decodePng(buf) {
  if (!buf || buf.length < 24 || buf[0] !== 0x89 || buf[1] !== 0x50) return null;
  let offset = 8;
  let width = 0;
  let height = 0;
  let bit = 0;
  let color = 0;
  let plte = null;
  const idat = [];
  while (offset + 12 <= buf.length) {
    const len = buf.readUInt32BE(offset);
    const type = buf.toString("ascii", offset + 4, offset + 8);
    const start = offset + 8;
    const end = start + len;
    if (end + 4 > buf.length) break;
    if (type === "IHDR") {
      width = buf.readUInt32BE(start);
      height = buf.readUInt32BE(start + 4);
      bit = buf[start + 8];
      color = buf[start + 9];
    } else if (type === "PLTE") {
      plte = buf.subarray(start, end);
    } else if (type === "IDAT") {
      idat.push(buf.subarray(start, end));
    } else if (type === "IEND") break;
    offset = end + 4;
  }
  if (!width || !height || bit !== 8 || width > 512 || height > 512) return null;
  const bpp = color === 6 ? 4 : color === 2 ? 3 : color === 3 || color === 0 ? 1 : 0;
  if (!bpp) return null;
  if (color === 3 && !plte) return null;
  let raw;
  try {
    raw = inflateSync(Buffer.concat(idat));
  } catch {
    return null;
  }
  const stride = width * bpp;
  const rows = [];
  let i = 0;
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < height; y += 1) {
    if (i + 1 + stride > raw.length) return null;
    const filter = raw[i];
    const slice = raw.subarray(i + 1, i + 1 + stride);
    const row = Buffer.alloc(stride);
    for (let x = 0; x < stride; x += 1) {
      const a = x >= bpp ? row[x - bpp] : 0;
      const b = prev[x];
      const c = x >= bpp ? prev[x - bpp] : 0;
      const v = slice[x];
      if (filter === 0) row[x] = v;
      else if (filter === 1) row[x] = (v + a) & 255;
      else if (filter === 2) row[x] = (v + b) & 255;
      else if (filter === 3) row[x] = (v + ((a + b) >> 1)) & 255;
      else if (filter === 4) row[x] = (v + paeth(a, b, c)) & 255;
      else return null;
    }
    rows.push(row);
    prev = row;
    i += 1 + stride;
  }
  const rgba = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    const row = rows[y];
    for (let x = 0; x < width; x += 1) {
      const o = (y * width + x) * 4;
      if (color === 6) {
        rgba[o] = row[x * 4];
        rgba[o + 1] = row[x * 4 + 1];
        rgba[o + 2] = row[x * 4 + 2];
        rgba[o + 3] = row[x * 4 + 3];
      } else if (color === 2) {
        rgba[o] = row[x * 3];
        rgba[o + 1] = row[x * 3 + 1];
        rgba[o + 2] = row[x * 3 + 2];
        rgba[o + 3] = 255;
      } else if (color === 0) {
        rgba[o] = rgba[o + 1] = rgba[o + 2] = row[x];
        rgba[o + 3] = 255;
      } else {
        const pi = row[x] * 3;
        rgba[o] = plte[pi];
        rgba[o + 1] = plte[pi + 1];
        rgba[o + 2] = plte[pi + 2];
        rgba[o + 3] = 255;
      }
    }
  }
  return { width, height, rgba };
}

function decodeIcoDib(slice) {
  if (!slice || slice.length < 40) return null;
  const header = slice.readUInt32LE(0);
  if (header < 40) return null;
  const width = slice.readInt32LE(4);
  let height = slice.readInt32LE(8);
  if (height < 0) height = -height;
  else height = Math.floor(height / 2) || height;
  const bpp = slice.readUInt16LE(14);
  const compression = slice.readUInt32LE(16);
  if (compression !== 0 || width <= 0 || height <= 0 || width > 512 || height > 512) return null;
  if (bpp === 32) {
    const pixels = slice.subarray(header);
    const rowBytes = width * 4;
    if (pixels.length < rowBytes * height) return null;
    const rgba = Buffer.alloc(width * height * 4);
    for (let y = 0; y < height; y += 1) {
      const src = (height - 1 - y) * rowBytes;
      for (let x = 0; x < width; x += 1) {
        const s = src + x * 4;
        const d = (y * width + x) * 4;
        rgba[d] = pixels[s + 2];
        rgba[d + 1] = pixels[s + 1];
        rgba[d + 2] = pixels[s];
        rgba[d + 3] = pixels[s + 3] || 255;
      }
    }
    return { width, height, rgba };
  }
  if (bpp !== 4 && bpp !== 8) return null;
  const paletteCount = slice.readUInt32LE(32) || 1 << bpp;
  const palette = slice.subarray(header, header + paletteCount * 4);
  const xorOff = header + paletteCount * 4;
  const rowBytes = Math.ceil((width * bpp) / 32) * 4;
  if (xorOff + rowBytes * height > slice.length) return null;
  const rgba = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    const src = xorOff + (height - 1 - y) * rowBytes;
    for (let x = 0; x < width; x += 1) {
      let idx;
      if (bpp === 8) idx = slice[src + x];
      else {
        const byte = slice[src + (x >> 1)];
        idx = x % 2 === 0 ? byte >> 4 : byte & 15;
      }
      const p = idx * 4;
      const d = (y * width + x) * 4;
      rgba[d] = palette[p + 2];
      rgba[d + 1] = palette[p + 1];
      rgba[d + 2] = palette[p];
      rgba[d + 3] = 255;
    }
  }
  return { width, height, rgba };
}

export function decodeMark(buf) {
  if (!buf || buf.length < 8) return null;
  if (buf[0] === 0x89 && buf[1] === 0x50) return decodePng(buf);
  if (buf[0] !== 0 || buf[1] !== 0 || buf[2] !== 1) return null;
  const count = buf.readUInt16LE(4);
  const entries = [];
  for (let i = 0; i < count; i += 1) {
    const e = 6 + i * 16;
    if (e + 16 > buf.length) break;
    const w = buf[e] || 256;
    const h = buf[e + 1] || 256;
    const bpp = buf.readUInt16LE(e + 6);
    const size = buf.readUInt32LE(e + 8);
    const off = buf.readUInt32LE(e + 12);
    entries.push({ w, h, bpp, size, off });
  }
  entries.sort((a, b) => b.w * b.h * (b.bpp >= 32 ? 8 : 1) - a.w * a.h * (a.bpp >= 32 ? 8 : 1));
  for (const best of entries) {
    const slice = buf.subarray(best.off, best.off + best.size);
    const img = slice[0] === 0x89 ? decodePng(slice) : decodeIcoDib(slice);
    if (img) return img;
  }
  return null;
}

export function blitContain(rgb, canvasW, img, dx, dy, dw, dh) {
  if (!img?.rgba) return;
  const scale = Math.min(dw / img.width, dh / img.height);
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const ox = dx + Math.floor((dw - w) / 2);
  const oy = dy + Math.floor((dh - h) / 2);
  for (let y = 0; y < h; y += 1) {
    const sy = Math.min(img.height - 1, Math.floor((y / h) * img.height));
    for (let x = 0; x < w; x += 1) {
      const sx = Math.min(img.width - 1, Math.floor((x / w) * img.width));
      const i = (sy * img.width + sx) * 4;
      const a = img.rgba[i + 3];
      if (a < 24) continue;
      const px = ox + x;
      const py = oy + y;
      if (px < 0 || py < 0 || px >= canvasW) continue;
      const o = (py * canvasW + px) * 3;
      const inv = 1 - a / 255;
      rgb[o] = Math.round(img.rgba[i] * (a / 255) + rgb[o] * inv);
      rgb[o + 1] = Math.round(img.rgba[i + 1] * (a / 255) + rgb[o + 1] * inv);
      rgb[o + 2] = Math.round(img.rgba[i + 2] * (a / 255) + rgb[o + 2] * inv);
    }
  }
}
