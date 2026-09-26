import test from "node:test";
import assert from "node:assert/strict";
import { fetchHttps, extFrom, looksLikeImage } from "../scripts/desk/net.mjs";
import { hostAllowed } from "../scripts/desk/core.mjs";

test("fetchHttps refuses any host outside the allow-list before any network call", async () => {
  await assert.rejects(
    () => fetchHttps("https://evil.example.com/feed.xml", "application/xml", ["good.example.com"]),
    /off allowlist/,
  );
});

test("fetchHttps refuses a non-https url", async () => {
  await assert.rejects(
    () => fetchHttps("http://good.example.com/feed.xml", "application/xml", ["good.example.com"]),
    /off allowlist/,
  );
});

test("the allow-list cannot be weakened by adding a font host (regression guard)", async () => {
  // The old code special-cased fonts.googleapis.com in a way that would have
  // disabled the whole allow-list for any lab listing it. That escape hatch
  // is gone; this test pins it.
  await assert.rejects(
    () =>
      fetchHttps("https://evil.example.com/x", "application/xml", [
        "good.example.com",
        "fonts.googleapis.com",
        "fonts.gstatic.com",
      ]),
    /off allowlist/,
  );
});

test("extFrom picks the extension from a url or content type", () => {
  assert.equal(extFrom("https://x.com/a.png", "image/png"), ".png");
  assert.equal(extFrom("https://x.com/a", "image/svg+xml"), ".svg");
  assert.equal(extFrom("https://x.com/a", "image/jpeg"), ".jpg");
  assert.equal(extFrom("https://x.com/a.ico", "text/plain"), ".ico");
});

test("looksLikeImage sniffs real image magic bytes", () => {
  assert.equal(looksLikeImage(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), "image/png"), true);
  assert.equal(looksLikeImage(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]), "image/jpeg"), true);
  assert.equal(looksLikeImage(Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>"), "image/svg+xml"), true);
  assert.equal(looksLikeImage(Buffer.from("plain text"), "text/plain"), false);
  assert.equal(looksLikeImage(Buffer.alloc(4), "image/png"), false);
  assert.equal(looksLikeImage(Buffer.alloc(0), "image/png"), false);
});
