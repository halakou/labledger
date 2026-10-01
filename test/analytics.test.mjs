import test from "node:test";
// Tests build into a throwaway OUT. The checkout's real dist-site holds long
// paths the Windows test runner cannot always delete, so it never touches it.
import { setOutForTests } from "../scripts/desk/config.mjs";
setOutForTests(join(tmpdir(), "desk-test-out-" + Buffer.from(import.meta.url + process.pid).toString("hex").slice(0, 12)));
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { shell, setAnalyticsToken } from "../scripts/desk/render.mjs";
import { writeLlms } from "../scripts/desk/site-home.mjs";
import { getOut } from "../scripts/desk/config.mjs";

test("without a CF_ANALYTICS_TOKEN the beacon is absent and the CSP stays strict", () => {
  // C12: the default build has no token, so nothing may loosen the CSP — an
  // analytics script the CSP blocks is worse than no analytics at all.
  setAnalyticsToken("");
  const html = shell({ title: "t", description: "d", path: "/", body: "" });
  assert.equal(html.includes("cloudflareinsights"), false, "no beacon without a token");
  assert.equal(html.includes("beacon.min.js"), false);
});

test("with a CF_ANALYTICS_TOKEN the beacon ships and the CSP admits it", async () => {
  const token = "test-token-1234567890abcdef";
  setAnalyticsToken(token);
  const html = shell({ title: "t", description: "d", path: "/", body: "" });
  assert.ok(html.includes("beacon.min.js"), "the beacon ships with a token");
  assert.ok(html.includes('data-cf-beacon='), "the beacon carries its config");
  assert.ok(html.includes(token), "the beacon carries the token");

  // The CSP that ships must actually allow the script the page loads.
  await fs.rm(getOut(), { recursive: true, force: true });
  await fs.mkdir(getOut(), { recursive: true });
  await writeLlms([], []);
  const headers = await fs.readFile(join(getOut(), "_headers"), "utf8");
  assert.ok(headers.includes("https://static.cloudflareinsights.com"), "the CSP admits the beacon host");
  assert.ok(/script-src 'self' 'sha256-[^']+' https:\/\/static\.cloudflareinsights\.com/.test(headers), "script-src lists the beacon");

  setAnalyticsToken("");
  assert.equal(shell({ title: "t", description: "d", path: "/", body: "" }).includes("beacon.min.js"), false, "clearing the token removes the beacon again");
});

test("the status badge never claims LIVE before the status document arrives", () => {
  // C14: the badge used to read LIVE in the HTML and only ever get *more*
  // specific once the fetch landed, so a broken build left it lying.
  const html = shell({ title: "t", description: "d", path: "/", body: "" });
  const live = html.match(/id="desk-live"[^>]*>([^<]*)</);
  assert.ok(live, "the badge exists");
  assert.equal(live[1].trim(), "UNKNOWN", "the badge starts neutral, not LIVE");
  // The script that owns it must set a neutral state first, then degrade.
  assert.ok(html.includes("live.textContent='UNKNOWN'"), "the script starts from UNKNOWN");
  assert.ok(html.includes("live.textContent='STALE?'"), "a status document without builtAt is STALE?");
  assert.ok(html.includes("live.textContent='OFFLINE'"), "a failed fetch is OFFLINE");
});
