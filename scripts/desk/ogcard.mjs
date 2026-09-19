import { deflateSync } from "node:zlib";
import { dirname, join } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { OUT, kindLabel } from "./core.mjs";

const W = 1200;
const H = 630;
const PAPER = [244, 239, 228];
const INK = [28, 25, 20];
const MUTED = [90, 83, 72];

const FONT = {
  A: "01110100011000111111100011000110001",
  B: "111101000111110100011000111110",
  C: "011111000010000100001000001111",
  D: "111101000110001100011000111110",
  E: "111111000011110100001000011111",
  F: "111111000011110100001000010000",
  G: "011111000010000101111000101111",
  H: "100011000111111100011000110001",
  I: "1111100100001000010000100011111",
  J: "001110001000010000101000101110",
  K: "100011001011100101001001010001",
  L: "100001000010000100001000011111",
  M: "100011101110101100011000110001",
  N: "100011100110101100111000110001",
  O: "011101000110001100011000101110",
  P: "111101000111110100001000010000",
  Q: "011101000110001100011001001101",
  R: "111101000111110100101000110001",
  S: "011111000001110000010000111110",
  T: "111110010000100001000010000100",
  U: "100011000110001100011000101110",
  V: "100011000110001100010101000100",
  W: "100011000110001101011101110001",
  X: "100011000101010001001000110001",
  Y: "100011000101010001000010000100",
  Z: "111110000100010001000100011111",
  "0": "011101000110001100011000101110",
  "1": "0010001100001000010000100011111",
  "2": "011101000100001001000100011111",
  "3": "111100000101110000011000111110",
  "4": "100101001010010111110001000010",
  "5": "111111000011110000011000111110",
  "6": "011111000011110100011000101110",
  "7": "111110000100010001000100001000",
  "8": "011101000101110100011000101110",
  "9": "011101000110001011110000111110",
  " ": "000000000000000000000000000000",
  "-": "000000000000000111110000000000",
  ".": "000000000000000000000110001100",
  ",": "000000000000000000010110001000",
  ":": "000000110001100000000110001100",
  "/": "000010001000100010001000100000",
  "'": "001000010000100000000000000000",
};

function hexToRgb(hex) {
  const n = String(hex || "#1c1914").replace("#", "");
  return [parseInt(n.slice(0, 2), 16) || 28, parseInt(n.slice(2, 4), 16) || 25, parseInt(n.slice(4, 6), 16) || 20];
}

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i += 1) {
    c ^= buf[i];
    for (let k = 0; k < 8; k += 1) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const t = Buffer.from(type);
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([t, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function setPx(rgb, x, y, r, g, b) {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 3;
  rgb[i] = r;
  rgb[i + 1] = g;
  rgb[i + 2] = b;
}

function fillRect(rgb, x, y, w, h, r, g, b) {
  const x2 = Math.min(W, x + w);
  const y2 = Math.min(H, y + h);
  for (let yy = Math.max(0, y); yy < y2; yy += 1) {
    for (let xx = Math.max(0, x); xx < x2; xx += 1) setPx(rgb, xx, yy, r, g, b);
  }
}

function glyphBits(ch) {
  const bits = (FONT[ch] || FONT[ch.toUpperCase()] || FONT[" "]).padEnd(35, "0");
  const rows = [];
  for (let i = 0; i < 7; i += 1) rows.push(bits.slice(i * 5, i * 5 + 5));
  return rows;
}

function drawText(rgb, str, x, y, scale, color) {
  let cx = x;
  const up = String(str).toUpperCase();
  for (const ch of up) {
    const rows = glyphBits(ch);
    for (let r = 0; r < 7; r += 1) {
      for (let c = 0; c < 5; c += 1) {
        if (rows[r][c] === "1") fillRect(rgb, cx + c * scale, y + r * scale, scale, scale, color[0], color[1], color[2]);
      }
    }
    cx += 6 * scale;
    if (cx > W - 40) break;
  }
}

function wrapDraw(rgb, str, x, y, scale, color, maxChars, maxLines) {
  const words = String(str || "").toUpperCase().replace(/[^A-Z0-9 ,.'\/-]/g, " ").split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? cur + " " + w : w;
    if (next.length > maxChars) {
      if (cur) lines.push(cur);
      cur = w;
      if (lines.length >= maxLines) break;
    } else cur = next;
  }
  if (cur && lines.length < maxLines) lines.push(cur);
  lines.forEach((line, i) => drawText(rgb, line, x, y + i * (7 * scale + 10), scale, color));
}

function pngBuffer(rgb) {
  const raw = Buffer.alloc((W * 3 + 1) * H);
  for (let y = 0; y < H; y += 1) {
    raw[y * (W * 3 + 1)] = 0;
    rgb.copy(raw, y * (W * 3 + 1) + 1, y * W * 3, (y + 1) * W * 3);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}

export async function writeOgCard(brief) {
  const rgb = Buffer.alloc(W * H * 3);
  for (let i = 0; i < rgb.length; i += 3) {
    rgb[i] = PAPER[0];
    rgb[i + 1] = PAPER[1];
    rgb[i + 2] = PAPER[2];
  }
  const [r, g, b] = hexToRgb(brief.color);
  fillRect(rgb, 0, 0, W, 10, r, g, b);
  fillRect(rgb, 0, 0, 18, H, r, g, b);
  fillRect(rgb, 56, 70, 132, 132, r, g, b);
  fillRect(rgb, 68, 82, 108, 108, 255, 250, 242);
  drawText(rgb, (brief.mark || brief.lab || "?").slice(0, 1), 100, 114, 8, [r, g, b]);
  drawText(rgb, brief.lab || "DESK", 212, 92, 4, INK);
  drawText(rgb, (kindLabel(brief.kind) + "  ·  " + (brief.dateLabel || "")).toUpperCase(), 212, 140, 3, MUTED);
  wrapDraw(rgb, brief.headline || "", 56, 250, 6, INK, 28, 3);
  drawText(rgb, "LAB LEDGER DESK", 56, 560, 3, MUTED);
  fillRect(rgb, 56, 600, 180, 6, r, g, b);
  const rel = "og" + brief.path.replace(/\/$/, "") + ".png";
  const full = join(OUT, rel);
  await mkdir(dirname(full), { recursive: true });
  await writeFile(full, pngBuffer(rgb));
  return "/" + rel;
}

export async function writeOgCards(briefs) {
  let n = 0;
  for (const b of briefs) {
    try {
      b.ogImage = await writeOgCard(b);
      n += 1;
    } catch {
      b.ogImage = "/og.jpg";
    }
  }
  return n;
}
