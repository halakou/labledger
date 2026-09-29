import test from "node:test";
import assert from "node:assert/strict";
import { STRINGS, t, dictFor, DEFAULT_LANG } from "../scripts/desk/i18n.mjs";

test("every language defines every key the desk renders", () => {
  // A missing key silently falls back to English, which is safe for readers
  // but hides a half-finished translation from the author. This test makes
  // the gap loud instead.
  const keys = Object.keys(STRINGS[DEFAULT_LANG]);
  for (const lang of Object.keys(STRINGS)) {
    for (const key of keys) {
      assert.ok(
        typeof STRINGS[lang][key] === "string" && STRINGS[lang][key].length > 0,
        lang + " is missing the key " + key,
      );
    }
  }
});

test("t falls back to English for an unknown language or key", () => {
  assert.equal(t("zz", "nav_today"), STRINGS.en.nav_today);
  assert.equal(t("en", "no_such_key"), "no_such_key");
  assert.equal(t("fa", "nav_today"), "امروز");
});

test("dictFor returns the dictionary for a known language", () => {
  assert.equal(dictFor("fa"), STRINGS.fa);
  assert.equal(dictFor("en"), STRINGS.en);
  assert.equal(dictFor("zz"), STRINGS.en, "unknown language falls back to English");
});

test("the FAQ placeholder is present in every language so the channel link renders", () => {
  for (const lang of Object.keys(STRINGS)) {
    assert.ok(
      STRINGS[lang].faq_invent_p.includes("{tg}"),
      lang + " must keep the {tg} marker so the channel link can be substituted",
    );
  }
});
