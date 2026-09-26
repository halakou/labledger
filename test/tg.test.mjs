import test from "node:test";
import assert from "node:assert/strict";
import {
  handleFrom,
  chatIdOf,
  channelUrlOf,
  redactChat,
  hookSecret,
  escHtml,
  clipDek,
  postedLedgerFromResponse,
} from "../scripts/desk/tg.mjs";

test("handleFrom accepts every public channel form and refuses numerics", () => {
  assert.equal(handleFrom("@labledgerdesk"), "labledgerdesk");
  assert.equal(handleFrom("https://t.me/labledgerdesk"), "labledgerdesk");
  assert.equal(handleFrom("https://t.me/labledgerdesk/123"), "labledgerdesk");
  assert.equal(handleFrom("https://telegram.me/labledgerdesk"), "labledgerdesk");
  assert.equal(handleFrom("123456789"), "");
  assert.equal(handleFrom("not a handle!"), "");
});

test("chatIdOf prefers the explicit handle, then numeric, then channel url", () => {
  assert.equal(chatIdOf({ chat: "@labledgerdesk" }), "@labledgerdesk");
  assert.equal(chatIdOf({ chat: "-100123456789" }), "-100123456789");
  assert.equal(chatIdOf({ chat: "", channel: "https://t.me/labledgerdesk" }), "@labledgerdesk");
  assert.equal(chatIdOf({}), "@labledgerdesk");
});

test("channelUrlOf falls back safely", () => {
  assert.equal(channelUrlOf({ channel: "https://t.me/labledgerdesk" }), "https://t.me/labledgerdesk");
  assert.equal(channelUrlOf({ chat: "@labledgerdesk" }), "https://t.me/labledgerdesk");
  assert.equal(channelUrlOf({}), "https://t.me/labledgerdesk");
});

test("redactChat hides numeric chat ids from logs", () => {
  assert.equal(redactChat("-100123456789"), "numeric-id");
  assert.equal(redactChat("@labledgerdesk"), "@labledgerdesk");
});

test("hookSecret is deterministic and 32 hex chars", () => {
  const a = hookSecret("1234:ABC");
  const b = hookSecret("1234:ABC");
  const c = hookSecret("9999:XYZ");
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.equal(a.length, 32);
  assert.ok(/^[0-9a-f]{32}$/.test(a));
});

test("escHtml escapes every metacharacter Telegram parses", () => {
  assert.equal(escHtml("<b>&\"x\"</b>"), "&lt;b&gt;&amp;&quot;x&quot;&lt;/b&gt;");
});

test("clipDek cuts at a word boundary", () => {
  assert.equal(clipDek("short dek", 100), "short dek");
  const out = clipDek("the quick brown fox jumps over the lazy dog", 15);
  assert.ok(out.endsWith("…"));
  assert.ok(out.length <= 15);
});

test("posted ledger recovery reads the worker wrapper, not its keys", () => {
  const map = postedLedgerFromResponse({
    ok: true,
    posted: {
      "guid-1": "https://t.me/labledgerdesk/10",
      "guid-2": "https://t.me/labledgerdesk/11",
    },
  });
  assert.deepEqual(Object.keys(map).sort(), ["guid-1", "guid-2"]);
  assert.equal(map["guid-1"], "https://t.me/labledgerdesk/10");
  assert.equal(map.ok, undefined);
  assert.equal(map.posted, undefined);
});

test("posted ledger recovery unwraps a wrapper that was stored as the map", () => {
  const map = postedLedgerFromResponse({
    ok: true,
    posted: {
      ok: true,
      posted: { "guid-9": "https://t.me/labledgerdesk/9" },
    },
  });
  assert.deepEqual(map, { "guid-9": "https://t.me/labledgerdesk/9" });
});

test("posted ledger recovery drops non-urls and empty payloads", () => {
  assert.deepEqual(postedLedgerFromResponse(null), {});
  assert.deepEqual(postedLedgerFromResponse({ ok: true, posted: null }), {});
  assert.deepEqual(
    postedLedgerFromResponse({ ok: true, posted: { bad: "not-a-url", good: "https://t.me/labledgerdesk/1" } }),
    { good: "https://t.me/labledgerdesk/1" },
  );
});
