import test from "node:test";
import assert from "node:assert/strict";
import { disambiguateBriefPaths } from "../scripts/desk/net.mjs";
import { slugify } from "../scripts/desk/core.mjs";

// PR2 (slug collisions): the SEO audit found three live pairs whose
// briefs share one /b/ URL, so one brief's content is unreachable. The
// fixtures below use the live pairs' real slugs, dates and brief
// numbers, and the rule is filing order — the lowest ledgerId keeps
// the base URL, later filings get "-<ledgerId>".

function brief({ ledgerId, slug, year, month, day }) {
  return {
    ledgerId,
    slug,
    path: "/b/" + year + "/" + month + "/" + day + "/" + slug + "/",
    year,
    month,
    day,
  };
}

test("Gemini Omni pair: DeepMind 8571 and Google 8570 share one headline (2026-11-05)", () => {
  const slug = slugify("Gemini Omni 1.2 Flash: fast and cost-effective with longer clips");
  assert.equal(slug, "gemini-omni-1-2-flash-fast-and-cost-effective-with-longer-clips");
  const google = brief({ ledgerId: 8570, slug, year: "2026", month: "11", day: "05" });
  const deepmind = brief({ ledgerId: 8571, slug, year: "2026", month: "11", day: "05" });
  disambiguateBriefPaths([google, deepmind]);
  assert.equal(google.path, "/b/2026/11/05/gemini-omni-1-2-flash-fast-and-cost-effective-with-longer-clips/");
  assert.equal(google.slug, slug);
  assert.equal(
    deepmind.path,
    "/b/2026/11/05/gemini-omni-1-2-flash-fast-and-cost-effective-with-longer-clips-8571/",
  );
  assert.equal(deepmind.slug, slug + "-8571");
});

test("AWS Okta pair: the 72-character truncation erases Part 1 / Part 2 (2026-11-06)", () => {
  const h1 = "Govern AI agent access with Okta cross-app access and Amazon Bedrock AgentCore Part 1";
  const h2 = "Govern AI agent access with Okta cross-app access and Amazon Bedrock AgentCore Part 2";
  assert.equal(slugify(h1), slugify(h2));
  assert.equal(slugify(h1), "govern-ai-agent-access-with-okta-cross-app-access-and-amazon-bedrock");
  const slug = slugify(h1);
  // Part 2 (9076) was filed before Part 1 (9080), so Part 2 keeps the
  // base URL: the rule is filing order, not part order.
  const part2 = brief({ ledgerId: 9076, slug, year: "2026", month: "11", day: "06" });
  const part1 = brief({ ledgerId: 9080, slug, year: "2026", month: "11", day: "06" });
  disambiguateBriefPaths([part2, part1]);
  assert.equal(part2.path, "/b/2026/11/06/govern-ai-agent-access-with-okta-cross-app-access-and-amazon-bedrock/");
  assert.equal(
    part1.path,
    "/b/2026/11/06/govern-ai-agent-access-with-okta-cross-app-access-and-amazon-bedrock-9080/",
  );
});

test("Amplitude/OpenAI pair: the same headline re-filed (2026-11-12)", () => {
  const slug = slugify("How Amplitude ships product improvements in 1-2 days with OpenAI");
  assert.equal(slug, "how-amplitude-ships-product-improvements-in-1-2-days-with-openai");
  const first = brief({ ledgerId: 11359, slug, year: "2026", month: "11", day: "12" });
  const second = brief({ ledgerId: 11414, slug, year: "2026", month: "11", day: "12" });
  disambiguateBriefPaths([first, second]);
  assert.equal(first.path, "/b/2026/11/12/how-amplitude-ships-product-improvements-in-1-2-days-with-openai/");
  assert.equal(
    second.path,
    "/b/2026/11/12/how-amplitude-ships-product-improvements-in-1-2-days-with-openai-11414/",
  );
});

test("lab-vs-open: the same /b/ URL in both ledgers keeps the lab filing's path", () => {
  const slug = "shared-release";
  const lab = brief({ ledgerId: 100, slug, year: "2026", month: "11", day: "16" });
  const open = brief({ ledgerId: 50, slug, year: "2026", month: "11", day: "16" });
  // Callers pass the lab ledger first, so the lab filing wins the tie
  // even though the open filing has the lower number.
  disambiguateBriefPaths([lab, open]);
  assert.equal(lab.path, "/b/2026/11/16/shared-release/");
  assert.equal(open.path, "/b/2026/11/16/shared-release-50/");
});

test("disambiguation is idempotent: a second run changes nothing", () => {
  const slug = "gemini-omni-1-2-flash-fast-and-cost-effective-with-longer-clips";
  const first = brief({ ledgerId: 8570, slug, year: "2026", month: "11", day: "05" });
  const second = brief({ ledgerId: 8571, slug, year: "2026", month: "11", day: "05" });
  disambiguateBriefPaths([first, second]);
  const afterFirst = [first.path, first.slug, second.path, second.slug];
  disambiguateBriefPaths([first, second]);
  assert.deepEqual([first.path, first.slug, second.path, second.slug], afterFirst);
});

test("briefs with distinct paths are untouched", () => {
  const a = brief({ ledgerId: 1, slug: "alpha", year: "2026", month: "11", day: "16" });
  const b = brief({ ledgerId: 2, slug: "beta", year: "2026", month: "11", day: "16" });
  disambiguateBriefPaths([a, b]);
  assert.equal(a.path, "/b/2026/11/16/alpha/");
  assert.equal(b.path, "/b/2026/11/16/beta/");
});

test("the same slug on different dates is not a collision", () => {
  const a = brief({ ledgerId: 1, slug: "same-story", year: "2026", month: "11", day: "15" });
  const b = brief({ ledgerId: 2, slug: "same-story", year: "2026", month: "11", day: "16" });
  disambiguateBriefPaths([a, b]);
  assert.equal(a.path, "/b/2026/11/15/same-story/");
  assert.equal(b.path, "/b/2026/11/16/same-story/");
});

test("a natural slug that equals another filing's disambiguated path gets -2", () => {
  // A keeps "s-5"; B keeps "s"; C's first candidate "s-5" is taken, so
  // it falls through to "s-5-2".
  const a = brief({ ledgerId: 1, slug: "s-5", year: "2026", month: "11", day: "16" });
  const b = brief({ ledgerId: 2, slug: "s", year: "2026", month: "11", day: "16" });
  const c = brief({ ledgerId: 5, slug: "s", year: "2026", month: "11", day: "16" });
  disambiguateBriefPaths([a, b, c]);
  assert.equal(a.path, "/b/2026/11/16/s-5/");
  assert.equal(b.path, "/b/2026/11/16/s/");
  assert.equal(c.path, "/b/2026/11/16/s-5-2/");
});
