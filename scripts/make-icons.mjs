// C18: generate the PWA icons from the desk's own mark. No dependency, no
// download — this draws the same 96-unit design the favicon SVG uses and
// writes it as two real square PNGs at 192 and 512, which is what an install
// prompt actually asks for. Run it whenever the mark changes:
//
//   node scripts/make-icons.mjs
//
// The output is committed to assets/ and copied to the site root at build
// time by site-home.mjs, so the pipeline never depends on this script.
import zlib from "node:zlib";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "..", "assets");

function chunk(type, data) {
  const withType = Buffer.concat([Buffer.from(type), Buffer.from(data)]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(zlib.crc32(withType) >>> 0);
  return Buffer.concat([length, withType, crc]);
}

function encodePng(width, height, rgba) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // RGBA
  const stride = width * 4;
  const rows = [];
  for (let y = 0; y < height; y += 1) {
    rows.push(Buffer.concat([Buffer.from([0]), Buffer.from(rgba.slice(y * stride, (y + 1) * stride))]));
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", zlib.deflateSync(Buffer.concat(rows), { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// The desk mark at 96 units: rounded dark square, faint inner ring, block L,
// rust dot with a soft ring. Mirrors favicon.svg exactly.
function draw(size) {
  const s = size / 96;
  const px = [];
  for (let y = 0; y < size; y += 1) {
    const row = [];
    for (let x = 0; x < size; x += 1) row.push([13, 16, 21, 255]); // #0d1015
    px.push(row);
  }
  const set = (x, y, c) => {
    if (x >= 0 && x < size && y >= 0 && y < size) px[y][x] = c;
  };
  const rect = (x0, y0, w, h, c) => {
    for (let y = Math.floor(y0); y < Math.min(size, Math.floor(y0 + h)); y += 1)
      for (let x = Math.floor(x0); x < Math.min(size, Math.floor(x0 + w)); x += 1) set(x, y, c);
  };
  const disc = (cx, cy, r, c) => {
    for (let y = 0; y < size; y += 1)
      for (let x = 0; x < size; x += 1) {
        const dx = (x + 0.5) / s - cx, dy = (y + 0.5) / s - cy;
        if (dx * dx + dy * dy <= r * r) set(x, y, c);
      }
  };
  const ring = (cx, cy, r, thick, c) => {
    for (let y = 0; y < size; y += 1)
      for (let x = 0; x < size; x += 1) {
        const dx = (x + 0.5) / s - cx, dy = (y + 0.5) / s - cy;
        const d2 = dx * dx + dy * dy;
        if ((r - thick) ** 2 <= d2 && d2 <= r * r) set(x, y, c);
      }
  };
  const ringCol = [255, 255, 255, 31];
  rect(1 * s, 1 * s, 94 * s, Math.max(1, 2 * s), ringCol);
  rect(1 * s, 93 * s, 94 * s, Math.max(1, 2 * s), ringCol);
  rect(1 * s, 1 * s, Math.max(1, 2 * s), 94 * s, ringCol);
  rect(93 * s, 1 * s, Math.max(1, 2 * s), 94 * s, ringCol);
  const ink = [240, 244, 248, 255];
  rect(26 * s, 22 * s, 14 * s, 52 * s, ink); // vertical of the L
  rect(26 * s, 60 * s, 46 * s, 14 * s, ink); // foot of the L
  disc(72, 26, 6, [255, 87, 34, 255]);
  ring(72, 26, 10, 2, [255, 87, 34, 89]);
  const flat = [];
  for (const row of px) for (const c of row) flat.push(...c);
  return Uint8Array.from(flat);
}

for (const size of [192, 512]) {
  const file = join(outDir, "icon-" + size + ".png");
  const png = encodePng(size, size, draw(size));
  writeFileSync(file, png);
  console.log("wrote " + file + " (" + size + "x" + size + ", " + png.length + " bytes)");
}
