// Source-logo fixes (F2/F3/F5/F7/F10): the marks are the real company marks,
// the fetched-mark pipeline rejects mislabelled payloads, the 16-bit PNG
// decode is correct, the background key needs a uniform background, and the
// mobile tile fits its 48px column.
import test from "node:test";
import assert from "node:assert/strict";
import { deflateSync } from "node:zlib";
import { VECTOR_MARKS } from "../scripts/desk/marks-vector.mjs";
import { looksLikeMark, extFromBytes } from "../scripts/desk/fetch-mark.mjs";
import { decodePng, keyBackground, symbolForRaster } from "../scripts/desk/sprite.mjs";

function symbol(id) {
  const m = VECTOR_MARKS.match(new RegExp('<symbol id="mark-' + id + '"[^>]*>([\\s\\S]*?)</symbol>'));
  assert.ok(m, "mark-" + id + " exists");
  return m[0];
}

// ---- F2: the six fixed marks are the real company marks -------------------
test("anthropic is the starburst, not the A", () => {
  const s = symbol("anthropic");
  // 6 bars: 6 M segments, stroked, no fill. The cached anthropic.ico is the
  // "AI" monogram — never trace it; the starburst is built from the trademark.
  assert.match(s, /stroke="currentColor" stroke-width="2\.2"/);
  assert.match(s, /fill="none"/);
  // The path's d attribute (space + d=); the symbol id "mark-anthropic"
  // also contains d=" so the match must anchor on the space before it.
  const d = (s.match(/ d="([^"]+)"/) || [])[1];
  assert.equal((d.match(/M/g) || []).length, 6, "six bars");
  assert.equal(d.includes("17.3041"), false, "the old A letterform is gone");
});

test("bair is a gold bear silhouette, not MB", () => {
  const s = symbol("bair");
  assert.match(s, /fill="currentColor"/);
  assert.equal(s.includes("M4 18.5V5.5h2.3"), false, "the old MB letters are gone");
  assert.match(s, /M11\.74 1\.77/, "bear silhouette");
});

test("microsoft and microsoft ai are the four real squares", () => {
  for (const id of ["microsoft", "msftai"]) {
    const s = symbol(id);
    for (const c of ["#F25022", "#7FBA00", "#00A4EF", "#FFB900"]) {
      assert.ok(s.includes('fill="' + c + '"'), id + " has " + c);
    }
  }
  // The msftai zigzag was invented; it must not come back.
  assert.equal(symbol("msftai").includes("12.4 2.2 1.6 3.3"), false);
});

test("huggingface and transformers are the real HF face", () => {
  for (const id of ["huggingface", "transformers"]) {
    const s = symbol(id);
    assert.match(s, /viewBox="0 0 95 88"/);
    assert.ok(s.includes('fill="#FFD21E"'), id + " yellow face");
    assert.ok(s.includes('fill="#FF9D0B"'), id + " orange ring");
    assert.ok(s.includes('fill="#3A3B45"'), id + " dark eyes");
    assert.ok(s.includes('fill="#FF323D"'), id + " red mouth");
  }
  assert.equal(symbol("transformers").includes("M12 1.2"), false, "the invented star is gone");
});

test("deepspeed is the orange network, not chevrons", () => {
  const s = symbol("deepspeed");
  assert.ok(s.includes('fill="#F17F00"'), "orange network");
  assert.ok(s.includes('fill="#FFC60F"'), "yellow accent");
  assert.equal(s.includes("M2.4 7.2"), false, "the invented chevrons are gone");
});

test("deepspeed links are stroked, not a filled hull", () => {
  // The real mark is nodes + links with a mostly empty interior. The first
  // fix filled the convex hull of the outer nodes — a solid orange blob —
  // which changes the shape. The links must be strokes and the nodes
  // circles; no filled orange path may exist in the symbol.
  const s = symbol("deepspeed");
  assert.match(s, /stroke="#F17F00" stroke-width="1"/, "links are stroked");
  assert.equal((s.match(/<circle/g) || []).length, 6, "six node circles");
  assert.equal(s.includes('<path fill="#F17F00"'), false, "no filled orange path (the hull)");
  assert.equal(s.includes("M21.91 1.05"), false, "the filled hull is gone");
  // All nine links from the company's own deepspeed.png, traced node to node.
  for (const link of [
    "M22.15 1.85L6.65 4.95", "M22.15 1.85L12.85 11.15", "M22.15 1.85L18.75 17.05",
    "M6.65 4.95L5.95 12.75", "M6.65 4.95L10.95 17.75",
    "M12.85 11.15L5.95 12.75", "M12.85 11.15L10.95 17.75",
    "M5.95 12.75L18.75 17.05", "M18.75 17.05L10.95 17.75",
  ]) assert.ok(s.includes(link), "link " + link);
});

test("jax is the 3d cube letters, not an x", () => {
  const s = symbol("jax");
  for (const c of ["#5E97F6", "#2A56C6", "#3367D6", "#EA80FC", "#9C27B0", "#6A1B9A", "#00695C", "#00796B", "#26A69A"]) {
    assert.ok(s.includes('fill="' + c + '"'), "jax has " + c);
  }
  assert.equal(s.includes("M3.2 3.4"), false, "the old X letterform is gone");
});

test("the unused meta symbol is gone", () => {
  assert.equal(VECTOR_MARKS.includes('id="mark-meta"'), false);
});

// ---- F3: fetched marks — reject WebP, derive the extension from magic -----
function padded(head, len = 500) {
  const b = Buffer.alloc(len);
  Buffer.from(head).copy(b);
  return b;
}
test("looksLikeMark rejects webp and html, accepts the decodable formats", () => {
  const webp = Buffer.concat([
    Buffer.from("RIFF"),
    Buffer.from([0x00, 0x00, 0x00, 0x00]),
    Buffer.from("WEBPVP8 "),
    Buffer.alloc(492),
  ]);
  assert.equal(looksLikeMark(webp, "image/png"), false, "webp has no decoder here");
  assert.equal(looksLikeMark(padded("<html><head>"), "image/png"), false);
  assert.equal(looksLikeMark(padded([0x89, 0x50, 0x4e, 0x47]), "image/png"), true);
  assert.equal(looksLikeMark(padded([0x00, 0x00, 0x01, 0x00]), "image/x-icon"), true);
  assert.equal(looksLikeMark(padded([0xff, 0xd8, 0xff, 0xe0]), "image/jpeg"), true);
  const svg = Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'><path d='M0 0'/></svg>" + " ".repeat(200));
  assert.equal(looksLikeMark(svg, "image/svg+xml"), true);
});

test("extFromBytes reads the magic, never the url or the declared type", () => {
  assert.equal(extFromBytes(padded([0x89, 0x50])), ".png");
  assert.equal(extFromBytes(padded([0x00, 0x00, 0x01])), ".ico");
  assert.equal(extFromBytes(padded([0xff, 0xd8])), ".jpg");
  const webp = Buffer.alloc(20);
  Buffer.from("RIFF").copy(webp, 0);
  Buffer.from("WEBP").copy(webp, 8);
  assert.equal(extFromBytes(webp), ".webp");
  assert.equal(extFromBytes(Buffer.from("<svg></svg>")), null, "svg has no magic bytes");
  assert.equal(extFromBytes(Buffer.alloc(0)), null);
});

test("a webp payload in a .png file is labelled image/webp in the sprite", () => {
  const webp = Buffer.concat([
    Buffer.from("RIFF"),
    Buffer.from([0x1a, 0x00, 0x00, 0x00]),
    Buffer.from("WEBPVP8 "),
    Buffer.alloc(400),
  ]);
  const sym = symbolForRaster("tc", ".png", webp);
  assert.match(sym, /data:image\/webp;base64,/);
  assert.equal(sym.includes("data:image/png"), false);
});

// ---- F5: the 16-bit PNG decode and the multi-corner background key --------
function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c & 1 ? 0xedb88320 : 0) ^ (c >>> 1);
  }
  return (~c) >>> 0;
}
function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

test("decodePng reconstructs a 16-bit sub-filtered row (mittr regression)", () => {
  // 2x1 RGBA 16-bit. Row filter 1 (Sub). pixel0 is stored raw; pixel1 is
  // stored as (pixel1 - pixel0) so the decoder must step by one PIXEL (8
  // bytes), not one channel (4). The old step mixed the low byte of one
  // sample into the next and MIT Technology Review's 16-bit favicon decoded
  // as a green scrambled T.
  const pixel0 = [0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88];
  const pixel1 = [0x99, 0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff, 0x00];
  const stored1 = pixel1.map((v, i) => (v - pixel0[i] + 256) % 256);
  const raw = Buffer.from([1, ...pixel0, ...stored1]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(2, 0);
  ihdr.writeUInt32BE(1, 4);
  ihdr[8] = 16;
  ihdr[9] = 6;
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
  const rgba = decodePng(png, 2, 1, 6);
  assert.ok(rgba, "decodes");
  // 16-bit keeps only the high byte of each sample.
  assert.deepEqual([...rgba.subarray(0, 4)], [0x11, 0x33, 0x55, 0x77]);
  assert.deepEqual([...rgba.subarray(4, 8)], [0x99, 0xbb, 0xdd, 0xff]);
});

function rgbaImage(w, h, fill) {
  const buf = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    buf[i * 4] = fill[0];
    buf[i * 4 + 1] = fill[1];
    buf[i * 4 + 2] = fill[2];
    buf[i * 4 + 3] = fill[3];
  }
  return buf;
}
function setPx(buf, w, x, y, c) {
  const i = (y * w + x) * 4;
  buf[i] = c[0];
  buf[i + 1] = c[1];
  buf[i + 2] = c[2];
  buf[i + 3] = c[3];
}

test("keyBackground keys a uniform background and keeps the logo", () => {
  const w = 32, h = 32;
  const img = rgbaImage(w, h, [255, 255, 255, 255]);
  for (let y = 6; y < 26; y++) for (let x = 6; x < 26; x++) setPx(img, w, x, y, [0, 0, 0, 255]);
  const out = keyBackground(img, w, h);
  assert.equal(out.skipped, undefined, "keyed, not skipped");
  assert.equal(out[(2 * w + 2) * 4 + 3], 0, "corner background is transparent");
  assert.equal(out[(16 * w + 16) * 4 + 3], 255, "the logo stays opaque");
});

test("keyBackground refuses a non-uniform background (mittr regression)", () => {
  // The MIT Technology Review T fills its canvas: the four corners are four
  // different greys (part of the logo, not a background). Keying one corner
  // ate the T itself. With no uniform background there is nothing to key.
  const w = 32, h = 32;
  const img = rgbaImage(w, h, [150, 150, 150, 255]);
  setPx(img, w, 2, 2, [128, 130, 133, 255]);
  setPx(img, w, w - 3, 2, [209, 211, 212, 255]);
  setPx(img, w, 2, h - 3, [167, 169, 172, 255]);
  setPx(img, w, w - 3, h - 3, [100, 100, 100, 255]);
  assert.deepEqual(keyBackground(img, w, h), { skipped: null });
});

test("keyBackground skips when the key would eat the logo", () => {
  const w = 32, h = 32;
  const img = rgbaImage(w, h, [200, 200, 200, 255]);
  const out = keyBackground(img, w, h);
  assert.deepEqual(out, { skipped: "#c8c8c8" });
});

// ---- F7: the mobile tile fits its 48px column ------------------------------
test("the mobile tile is 48px in the 48px logo column", async () => {
  const { CSS } = await import("../scripts/desk/render.mjs");
  const flat = CSS.replace(/\r/g, "");
  const mq = flat.indexOf("@media(max-width:860px){");
  assert.ok(mq >= 0, "the 860px query exists");
  const tile = flat.indexOf(".ledger-mark-tile{width:48px;height:48px}", mq);
  assert.ok(tile > mq, "the tile is 48px inside the mobile query");
  const sprite = flat.indexOf(".ledger-mark-tile .mark-sprite{width:38px;height:38px}", mq);
  assert.ok(sprite > mq, "the sprite shrinks to 38px inside the mobile query");
});
