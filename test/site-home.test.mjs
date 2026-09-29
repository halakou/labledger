import test from "node:test";
import assert from "node:assert/strict";
import { HOME_MAX, HOME_FAQ } from "../scripts/desk/site-home.mjs";

test("the homepage board is capped well below the full ledger", () => {
  // The homepage is a front page, not an archive. 28+ rows made it a
  // 19,000px page; the cap keeps it a front page and points the rest of the
  // ledger at /week/ and the lab archives.
  assert.ok(HOME_MAX <= 20, "HOME_MAX must stay at or under 20");
  assert.ok(HOME_MAX >= 12, "HOME_MAX must still show a real board");
});

test("the homepage FAQ has three complete entries", () => {
  assert.equal(HOME_FAQ.length, 3, "the homepage must have three FAQ entries");
  for (const item of HOME_FAQ) {
    assert.ok(typeof item.h === "string" && item.h.length > 0, "a FAQ heading is empty");
    assert.ok(typeof item.p === "string" && item.p.length > 0, "a FAQ body is empty");
  }
});
