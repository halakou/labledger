import test from "node:test";
import assert from "node:assert/strict";
import { HOME_MAX, homeFaq } from "../scripts/desk/site-home.mjs";

test("the homepage board is capped well below the full ledger", () => {
  // The homepage is a front page, not an archive. 28+ rows made it a
  // 19,000px page; the cap keeps it a front page and points the rest of the
  // ledger at /week/ and the lab archives.
  assert.ok(HOME_MAX <= 20, "HOME_MAX must stay at or under 20");
  assert.ok(HOME_MAX >= 12, "HOME_MAX must still show a real board");
});

test("homeFaq builds the three FAQ entries for each language", () => {
  for (const lang of ["en", "fa"]) {
    const faq = homeFaq(lang);
    assert.equal(faq.length, 3, lang + " must have three FAQ entries");
    for (const item of faq) {
      assert.ok(typeof item.h === "string" && item.h.length > 0, lang + " FAQ heading is empty");
      assert.ok(typeof item.p === "string" && item.p.length > 0, lang + " FAQ body is empty");
    }
  }
});
