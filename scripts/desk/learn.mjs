// The desk's field guide — original explainers and tutorials, written for
// this site only. Nothing here is copied or syndicated. Each entry lives at
// /learn/<slug>/ and is linked from the nav once it exists. Unlike the board,
// these do not expire: they are reference material.
//
// Publishing a piece of our own = adding one object to ENTRIES. The index,
// the sitemap (archives.mjs) and llms.txt (site-home.mjs) all read this list,
// so a new entry is reachable everywhere without a second touch.
//
// Body section kinds:
//   prose    — heading + paragraphs (+ optional `ul` bullet list)
//   terms    — heading + term/definition rows; the guide's payload
//   steps    — heading + ordered steps with titles, for tutorials
//   callout  — labeled aside (`tone`: note | tip | warn), not in the TOC
//   quote    — pull quote with optional attribution, not in the TOC
//   code     — heading + pre/code block with a language label
import { CHANNEL, SITE, esc, clip } from "./core.mjs";
import { jsonLdScript, shell } from "./render.mjs";
import { write } from "./net.mjs";

const ENTRIES = [
  {
    slug: "ai-vocabulary",
    title: "The AI vocabulary, unpacked",
    dek: "Every acronym the labs use in their announcements, explained in plain language. No prior knowledge assumed, none required.",
    kind: "Explainer",
    level: "Beginner",
    date: "2026-09-21",
    reading: 9,
    body: [
      {
        h: "Why this exists",
        kind: "prose",
        p: [
          "The labs publish fast. OpenAI ships, Anthropic replies, Google previews, and within an hour the same three acronyms are everywhere. The announcements assume you already know what they mean. Most people do not, and the definitions you find online are usually written for someone who already works in the field.",
          "This guide is the opposite. It assumes nothing. Each term below gets one short explanation in everyday language, plus where you will actually see it — because a term you can define but never notice is a term you will forget by Friday.",
          "If you read the desk's board, these are the words in the headlines. Learn them once and the board reads differently.",
        ],
      },
      {
        kind: "callout",
        tone: "tip",
        label: "How to read this page",
        p: [
          "You do not have to read it top to bottom. Skim the bold words until one is unfamiliar, read that one, and close the tab. This is a reference shelf, not a chapter.",
        ],
      },
      {
        h: "The model itself",
        kind: "terms",
        terms: [
          ["LLM", "Large language model. A program trained on enormous amounts of text until it can predict the next word in a sentence. That prediction is the whole trick. It does not know facts the way a database does; it knows which words tend to follow which other words. When it sounds certain, that is the style of the training data, not evidence of confidence."],
          ["Parameters", "The numbers inside the model that got adjusted during training. A bigger parameter count usually means a model that handles harder questions, and always means one that costs more to run. When a lab says 700B, that is 700 billion of these numbers."],
          ["Context window", "How much text the model can hold in mind at once, measured in tokens. A small window forgets the beginning of a long document before it reaches the end. A large one can read a whole book and still answer questions about page one. Labs treat this as a headline feature now, because it is what makes long documents and long conversations actually work."],
          ["Token", "A chunk of text, roughly three-quarters of a word for English. Models do not see words or letters; they see tokens. Pricing, context windows, and speed limits are all counted in these."],
          ["Training", "The process of reading all that text and adjusting the parameters until predictions get good. It is expensive, slow, and the reason only a handful of companies ship frontier models."],
          ["Inference", "Running the trained model to produce an answer. This is what you pay for when you use an API, and it is why a bigger model is not always the right one — inference cost scales with size."],
        ],
      },
      {
        h: "How a model is taught to behave",
        kind: "terms",
        terms: [
          ["Pre-training", "The first and biggest stage. Read the internet, learn to predict text. At the end of this the model can write fluently and knows a great deal, but it has no notion of being helpful, honest, or safe. It will complete any sentence, including ones nobody wants completed."],
          ["Fine-tuning", "Practice on a smaller, curated set of examples to shift the model's behavior. After pre-training a model writes like everything it read; after fine-tuning it writes like the examples it was shown. This is where a lab's actual character comes from."],
          ["SFT", "Supervised fine-tuning. The lab shows the model good answers and has it imitate them. Straightforward, effective, and limited by how good the examples are."],
          ["RLHF", "Reinforcement learning from human feedback. Instead of showing answers, humans rank answers. The model then adjusts to produce the kind of answer that ranked well. This is what made the first ChatGPT feel usable instead of merely fluent. It is also where a model learns to be evasive, because refusing politely tends to rank safely."],
          ["DPO", "Direct preference optimization. A newer, cheaper way to get most of RLHF's effect without a separate reward model. You will see it in release notes because it is the reason smaller labs can now ship well-behaved models."],
          ["Alignment", "The broad project of making a model do what was actually intended rather than what was literally asked. There is no finished version of this. Every lab has a team for it and every lab defines success differently, which is why two models can be equally capable and behave nothing alike."],
        ],
      },
      {
        h: "The acronyms in architecture",
        kind: "terms",
        terms: [
          ["Transformer", "The design behind essentially every modern model. Its key idea is attention: instead of reading word by word, it looks at the whole passage at once and decides which parts matter. That single change is why models got good enough to be useful."],
          ["Attention", "The mechanism of deciding what to pay attention to. When a model reads \"the bank,\" attention is what tells it whether the surrounding words are about money or about a river. It is weights, not a thinking process, but the effect is the same."],
          ["MoE", "Mixture of experts. Instead of one giant model answering every question, several smaller specialist models sit inside, and a router sends each token to the right one. The model can be very large overall while each answer only activates part of it, which makes strong models affordable to run. Most frontier models are now built this way, and the labs rarely shout about it."],
          ["Multimodal", "A model that takes more than one kind of input, usually text plus images, sometimes audio and video. The hard part is not adding the second input; it is making the model connect the two meaningfully, which is still where results get unreliable."],
          ["Embedding", "Turning text into a list of numbers so that similar meanings sit close together. This is the quiet workhorse of search, recommendation, and retrieval. When a tool finds the right document without matching your exact keywords, an embedding did that."],
        ],
      },
      {
        h: "What a model actually ships as",
        kind: "terms",
        terms: [
          ["API", "The interface another program uses to talk to the model. Most AI products do not contain a model; they call one of these. When a lab reports enterprise traction, this is usually where the money is."],
          ["Agent", "A program that calls a model repeatedly, decides its own next step, and can use tools — search, code, a browser — instead of only answering. The word is used loosely. A real agent acts; a chatbot with a search box does not, no matter how it is marketed."],
          ["RAG", "Retrieval-augmented generation. Before answering, the system searches a private document set and hands the relevant parts to the model. This grounds the answer in something specific and current, which is why it is the standard pattern for enterprise AI. It also means the answer is only as good as the retrieval, and retrieval fails silently."],
          ["Guardrails", "The filters and rules layered on top of a model to block disallowed output. They are separate from the model and often visible: a refusal that appears before an answer is a guardrail, not an opinion."],
          ["Open weights", "A model whose parameters are published so anyone can run them. This is not the same as open source: the training data and method are usually absent. The distinction matters, and the labs that ship open weights prefer the looser term."],
        ],
      },
      {
        h: "The ones people argue about",
        kind: "terms",
        terms: [
          ["AGI", "Artificial general intelligence, a machine that can do most economically useful things a human can. Every lab has its own definition, which is convenient, because it lets each one claim progress toward a finish line nobody drew in the same place. Treat any AGI announcement as a claim about definitions first and capability second."],
          ["Reasoning", "In a model's release notes, this means it was trained to spend more steps on hard problems, often by producing intermediate work before the final answer. It is a real and measurable improvement on math, code, and logic. It is not the human faculty of reasoning, and the gap between the two is where most overreach in coverage happens."],
          ["Alignment tax", "The measurable performance a model gives up to be safe. It is real, labs measure it, and the honest argument in the field is about how much of it is worth paying."],
          ["Hallucination", "A confident wrong answer. The model is not lying; it is doing exactly what it was built to do, producing the most likely next words, and those words happen to be false. The error is structural, not a bug that a patch removes. This is why the desk keeps the primary source on every brief."],
        ],
      },
      {
        h: "How to use this guide",
        kind: "prose",
        p: [
          "Pick one section that matches what you see on the board today. If a lab announces a new model, the first three sections explain what is actually new. If the story is about a product or an enterprise deal, the fifth section is the one that applies.",
          "The terms above do not change quickly. The marketing around them does. When a new acronym appears in a headline and is not here, it is almost always a new name for one of the ideas above, and the desk will file it as such.",
        ],
      },
    ],
  },
  {
    slug: "how-to-read-a-model-announcement",
    title: "How to read a model announcement",
    dek: "A reviewer's pass over a launch post, in six steps. What to trust, what to skip, and where the real claim is hiding.",
    kind: "Tutorial",
    level: "Intermediate",
    date: "2026-09-22",
    reading: 7,
    body: [
      {
        h: "What the announcement is actually selling",
        kind: "prose",
        p: [
          "A model announcement is written by the people who made the model. That is not a flaw — it is the reason the desk reads them at all — but it means the post is a sales document with a benchmark table inside it. The facts are in there. They are just arranged to make the model look good.",
          "The skill is not skepticism for its own sake. It is knowing which parts of the post are claims you can check, which are claims about how the lab measured itself, and which are decoration. The six steps below are the pass a careful editor runs before anything gets filed.",
        ],
      },
      {
        h: "A reviewer's pass, in six steps",
        kind: "steps",
        items: [
          { t: "Find the primary link first", d: "Before reading any summary, open the lab's own post, paper, or release note. If the announcement has no primary link, that is the story: there is nothing to check yet." },
          { t: "Read the capability claim literally", d: "Strip the adjectives. \"Best-in-class reasoning\" is marketing; \"beats the previous model on AIME 2025 by 3 points\" is a claim. Write the claim down in your own words, using only what the post states." },
          { t: "Ask who chose the benchmark", d: "Labs compare against the models that make them look strongest, on the tasks their model is best at. A benchmark list is data, not a verdict. If the comparison omits the obvious rival, that omission is the headline." },
          { t: "Check what the numbers are measured on", d: "Reported scores can come from a tuned variant, a single run, or a temperature you will never use. Look for the words about how it was evaluated. Their absence is a detail, not a secret — note it and move on." },
          { t: "Separate availability from announcement", d: "Waitlist, coming soon, and available today are three different news items. The desk files the one that is real on the day it is filed." },
          { t: "Keep the claim attached to its source", d: "Whatever you carry away, carry the link with it. A claim without its source becomes a rumor within two retellings, and no one will be able to tell you which of the three versions was the real one." },
        ],
      },
      {
        kind: "callout",
        tone: "warn",
        label: "The one that misleads everyone",
        p: [
          "A benchmark number is not a fact about the model. It is a fact about one run of one eval by the people who are trying to win it. It can still be useful. It is never the whole answer, and a lead over a rival of a few points is usually inside the noise of a different run.",
        ],
      },
      {
        kind: "quote",
        quote: "The claim is always in the primary source. Everything else is a summary of a summary.",
        cite: "the desk, on why every brief keeps its source link",
      },
      {
        h: "What to do with the rest",
        kind: "prose",
        p: [
          "Most of the post — the quotes from executives, the partner logos, the vision paragraphs — is not for you. It is for investors and journalists on deadline. Let it go. The two sentences that survive your pass are the ones worth anything, and they are the two the desk will file.",
          "Run this pass on three announcements and it stops feeling like work. You start reading the benchmark table for what it is and the prose for what it is doing, and the announcements get a lot shorter.",
        ],
      },
    ],
  },
  {
    slug: "what-open-means",
    title: "What 'open' means when a lab says open weights",
    dek: "Open weights, open source, open research — three different things that all sound like the same thing. How to tell them apart in one read.",
    kind: "Explainer",
    level: "Intermediate",
    date: "2026-09-22",
    reading: 6,
    body: [
      {
        h: "Why the words blur together",
        kind: "prose",
        p: [
          "A lab publishes a model. The post says open. Within a day, half the coverage calls it open source and the other half calls it a leak of weights, and both sides are sure they are right. They are usually describing different parts of the same release.",
          "The distinction is not pedantry. It decides whether you can audit the model, whether you can use it commercially, and whether you can be cut off from it later. The rows below are the ones that matter.",
        ],
      },
      {
        h: "The words that do the work",
        kind: "terms",
        terms: [
          ["Open weights", "The model's parameters are published as a file you can download and run yourself. Nothing about the training data, the code, or the method is included. This is what most 'open' AI releases actually are."],
          ["Open source", "A specific legal standard, set by the Open Source Initiative: the source, the license, and the build process, free of restrictions on use or redistribution. By that standard almost no frontier model qualifies, because the weights without the training recipe are not source."],
          ["Permissive license", "A license like MIT or Apache 2.0: do what you want, including commercial use, just keep the notice. Model licenses modeled on these are the friendliest to build on, and the ones whose fine print is worth reading once."],
          ["Copyleft", "A license like GPL: you may use and modify it, but anything you ship that includes it must share its own source too. Rare in model weights, common in the tooling around them."],
          ["Base vs instruct", "A base model is the raw trained predictor — powerful, and quite happy to finish your prompt with something nobody asked for. An instruct or chat version has been fine-tuned to answer as asked. Downloading the base when you wanted the assistant is the most common first mistake."],
          ["Quantization", "Storing the model's numbers in fewer bits, usually 8 or 4 instead of 16, so it fits on smaller hardware. It saves memory and costs a little accuracy. On a laptop, that is usually the trade you want."],
          ["GGUF", "A single file format for running a quantized model on your own machine. A release that ships several sizes of it is aimed at local use, not only at an API."],
          ["Model card", "The document that ships with the weights: what was trained on, what it is for, and what it is not for. The honesty of a release lives here, and the good ones are genuinely short."],
        ],
      },
      {
        kind: "callout",
        tone: "note",
        label: "Why the wording matters",
        p: [
          "Labs that ship weights say open weights, and labs that want the goodwill of open source without the obligations are happy to let the shorter phrase do the work. Read the license, not the headline.",
        ],
      },
      {
        h: "How the desk tags these",
        kind: "prose",
        p: [
          "On the board, an open-weights release is filed as a release note with its primary source, same as any other. The desk does not call it open source unless the license says so, and it does not call a waitlist a launch. The words on the board are the words the source used, attached to the source.",
          "If a release here interests you, the model card is the next thing to open. It is the one document that tells you what the people who built it actually believe about it.",
        ],
      },
    ],
  },
];

export const GUIDE_ENTRIES = ENTRIES;

// Slugify a heading the way archives.mjs does, so the TOC and the anchor agree.
function anchorFor(h) {
  return h.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "section";
}

function escDate(iso) {
  const d = new Date(iso + "T00:00:00Z");
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

// The desk's own mark, reused in the byline: a dark square, a cream L, an
// accent bar underneath. It is the favicon, drawn in CSS.
const MARK = '<span class="g-mark" aria-hidden="true">L</span>';

// Callouts and quotes are asides, not sections, so they stay out of the TOC.
const TOC_KINDS = ["prose", "terms", "steps", "code"];

function paraHtml(p) {
  return "<p>" + esc(p) + "</p>";
}

function sectionHtml(s) {
  const a = anchorFor(s.h || s.label || s.quote || "section");

  if (s.kind === "callout") {
    const tone = s.tone === "tip" || s.tone === "warn" ? s.tone : "note";
    const label = s.label || (tone === "tip" ? "Tip" : tone === "warn" ? "Watch out" : "Note");
    return (
      '<aside class="g-callout g-callout--' + tone + '" id="' + a + '">' +
      '<p class="g-callout-label">' + esc(label) + "</p>" +
      (s.p || []).map(paraHtml).join("") +
      "</aside>"
    );
  }

  if (s.kind === "quote") {
    return (
      '<blockquote class="g-quote" id="' + a + '">' +
      "<p>" + esc(s.quote) + "</p>" +
      (s.cite ? '<footer class="g-quote-cite">' + esc(s.cite) + "</footer>" : "") +
      "</blockquote>"
    );
  }

  const head = s.h ? '<h2 id="' + a + '-h">' + esc(s.h) + "</h2>" : "";
  let inner = "";
  switch (s.kind) {
    case "terms":
      inner =
        '<dl class="g-terms">' +
        s.terms
          .map((t) => '<div class="g-term"><dt>' + esc(t[0]) + "</dt><dd>" + esc(t[1]) + "</dd></div>")
          .join("") +
        "</dl>";
      break;
    case "steps":
      inner =
        '<ol class="g-steps">' +
        s.items
          .map((it, j) => {
            const o = typeof it === "string" ? { d: it } : it;
            return (
              '<li class="g-step"><span class="g-step-n" aria-hidden="true">' +
              String(j + 1) +
              '</span><div class="g-step-x">' +
              (o.t ? '<p class="g-step-t">' + esc(o.t) + "</p>" : "") +
              "<p>" + esc(o.d) + "</p></div></li>"
            );
          })
          .join("") +
        "</ol>";
      break;
    case "code":
      inner =
        '<div class="g-code">' +
        (s.lang ? '<span class="g-code-lang">' + esc(s.lang) + "</span>" : "") +
        "<pre><code>" + s.lines.map(esc).join("\n") + "</code></pre></div>";
      break;
    default:
      inner =
        (s.p || []).map(paraHtml).join("") +
        (s.ul
          ? '<ul class="g-list">' + s.ul.map((x) => "<li>" + esc(x) + "</li>").join("") + "</ul>"
          : "");
  }
  return (
    '<section id="' + a + '" aria-labelledby="' + a + '-h">' + head + inner + "</section>"
  );
}

function tocHtml(entry) {
  const items = entry.body
    .filter((s) => TOC_KINDS.includes(s.kind) && s.h)
    .map((s) => {
      const a = anchorFor(s.h);
      return '<li><a href="#' + a + '">' + esc(s.h) + "</a></li>";
    })
    .join("");
  if (!items) return "";
  return (
    '<nav class="g-toc" aria-label="Sections"><p class="g-toc-label">In this guide</p><ol>' +
    items +
    "</ol></nav>"
  );
}

function crumbs(e) {
  return (
    '<nav class="g-crumbs" aria-label="Breadcrumb">' +
    '<a href="/">Today</a><span aria-hidden="true">/</span>' +
    '<a href="/learn/">Field guide</a><span aria-hidden="true">/</span>' +
    '<span aria-current="page">' + esc(e.title) + "</span></nav>"
  );
}

function relatedHtml(others) {
  if (!others.length) return "";
  const items = others
    .map(
      (o) =>
        '<li><a href="/learn/' + o.slug + '/">' + esc(o.title) + "<span>" + o.reading + " min</span></a></li>",
    )
    .join("");
  return (
    '<nav class="g-related" aria-label="More from the guide">' +
    '<p class="g-related-h">More from the guide</p><ul>' +
    items +
    "</ul></nav>"
  );
}

function cardTopHtml(e) {
  return (
    '<div class="g-card-top"><span class="g-kind">' + esc(e.kind) + "</span>" +
    '<span class="g-level">' + esc(e.level) + "</span></div>"
  );
}

function goLabel() {
  return '<span class="g-card-go">Read the guide <span aria-hidden="true">&#8594;</span></span>';
}

function cardHtml(e, i) {
  return (
    '<a class="g-card" href="/learn/' + e.slug + '/">' +
    '<div class="g-card-top">' +
    '<span class="g-kind">' + esc(e.kind) + '</span><span class="g-level">' + esc(e.level) + "</span>" +
    '<span class="g-card-n" aria-hidden="true">' + String(i + 1).padStart(2, "0") + "</span></div>" +
    "<h2>" + esc(e.title) + "</h2>" +
    "<p>" + esc(e.dek) + "</p>" +
    goLabel() +
    '<div class="g-card-meta"><span>' + e.reading + ' min read</span><span aria-hidden="true">&#183;</span>' +
    '<time datetime="' + esc(e.date) + '">' + escDate(e.date) + "</time></div>" +
    "</a>"
  );
}

function leadHtml(e) {
  const nTerms = e.body.reduce((n, s) => n + (s.terms ? s.terms.length : 0), 0);
  const nSteps = e.body.reduce((n, s) => n + (s.items ? s.items.length : 0), 0);
  const stat = nTerms ? nTerms + " terms" : nSteps ? nSteps + " steps" : e.reading + " min";
  return (
    '<section class="g-lead" aria-label="Featured guide">' +
    '<a class="g-lead-card" href="/learn/' + e.slug + '/">' +
    "<div>" +
    '<span class="g-lead-tag">Featured</span>' +
    cardTopHtml(e) +
    "<h2>" + esc(e.title) + "</h2>" +
    "<p>" + esc(e.dek) + "</p>" +
    goLabel() +
    "</div>" +
    '<div class="g-lead-side">' +
    '<span class="g-lead-stat"><b>' + String(nTerms || nSteps || e.reading) + "</b>" +
    (nTerms ? " terms" : nSteps ? " steps" : " min read") + "</span>" +
    "<span>" + e.reading + " min read</span>" +
    '<time datetime="' + esc(e.date) + '">' + escDate(e.date) + "</time>" +
    "</div>" +
    "</a></section>"
  );
}

function articleLd(e, url) {
  return jsonLdScript({
    "@context": "https://schema.org",
    "@type": "Article",
    headline: e.title,
    description: clip(e.dek, 158),
    datePublished: e.date,
    dateModified: e.date,
    url: SITE + url,
    mainEntityOfPage: SITE + url,
    author: { "@type": "Organization", name: "Lab Ledger Desk", url: SITE + "/" },
    publisher: {
      "@type": "NewsMediaOrganization",
      name: "Lab Ledger Desk",
      url: SITE + "/",
      logo: SITE + "/og.jpg",
    },
  });
}

export async function writeLearn() {
  for (const e of ENTRIES) {
    const url = "/learn/" + e.slug + "/";
    const sections = e.body.map(sectionHtml).join("");
    const nTerms = e.body.reduce((n, s) => n + (s.terms ? s.terms.length : 0), 0);
    const others = ENTRIES.filter((x) => x.slug !== e.slug).slice(0, 3);

    await write(
      "learn/" + e.slug + "/index.html",
      shell({
        title: e.title + " — Lab Ledger Desk",
        description: clip(e.dek, 158),
        path: url,
        ogType: "article",
        extra: articleLd(e, url),
        body: [
          '<article class="guide">',
          crumbs(e),
          '<header class="g-head">',
          '<div class="g-head-kicker">',
          '<span class="g-kind">' + esc(e.kind) + "</span>",
          '<span class="g-level">' + esc(e.level) + "</span>",
          '<span class="g-read">' + e.reading + " min read</span>",
          "</div>",
          "<h1>" + esc(e.title) + "</h1>",
          '<p class="dek">' + esc(e.dek) + "</p>",
          '<div class="g-byline">' + MARK +
          '<span class="g-byline-text"><b>Written by the desk</b> &#183; ' +
          '<time datetime="' + esc(e.date) + '">' + escDate(e.date) + "</time></span></div>",
          "</header>",
          '<div class="g-layout">',
          tocHtml(e),
          '<div class="g-body">' + sections + "</div>",
          "</div>",
          '<footer class="g-foot">',
          '<div class="g-byline-box">' + MARK +
          "<div><p class=\"g-byline-name\">Written by the desk</p>" +
          '<p class="g-byline-note">Original work for Lab Ledger Desk' +
          (nTerms ? " &#183; " + nTerms + " terms across " : " &#183; ") +
          e.body.length + " section" + (e.body.length === 1 ? "" : "s") +
          ". Not copied from anywhere, not syndicated.</p></div></div>",
          relatedHtml(others),
          '<a class="g-back" href="/learn/"><span aria-hidden="true">&#8592;</span> All guides</a>',
          "</footer>",
          "</article>",
        ].join(""),
      }),
    );
  }

  // The index lists every guide. It is the page the nav points at.
  const lead = ENTRIES[0];
  const rest = ENTRIES.slice(1);

  await write(
    "learn/index.html",
    shell({
      title: "Field guide — Lab Ledger Desk",
      description:
        "Original AI explainers and tutorials from the desk. Every term the labs use, in plain language. Written for this site, not copied.",
      path: "/learn/",
      extra: jsonLdScript({
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        name: "Lab Ledger Desk field guide",
        url: SITE + "/learn/",
        description: "Original AI explainers and tutorials, written for this site.",
        publisher: { "@type": "NewsMediaOrganization", name: "Lab Ledger Desk", url: SITE + "/" },
      }),
      body: [
        '<header class="g-hero">',
        '<p class="kicker">The field guide</p>',
        "<h1>Plain words for what the labs keep announcing</h1>",
        '<p class="dek">The board files what the labs moved. This guide explains the words they used to move it, and teaches the skills to read them yourself. Every entry is written here, for this site &#8212; nothing copied, nothing syndicated &#8212; and kept current instead of left to rot.</p>',
        '<div class="g-hero-meta"><span><strong>' + ENTRIES.length + "</strong> guide" +
        (ENTRIES.length === 1 ? "" : "s") + '</span><span aria-hidden="true">&#183;</span>' +
        "<span>Written by the desk</span><span aria-hidden=\"true\">&#183;</span>" +
        "<span>Free, always</span></div>",
        "</header>",
        leadHtml(lead),
        rest.length
          ? '<section class="g-grid" aria-label="All guides">' +
            rest.map((e, i) => cardHtml(e, i + 1)).join("") +
            "</section>"
          : "",
        '<section class="g-cta">',
        "<h2>Want a word explained that is not here?</h2>",
        "<p>The guide grows from what readers actually bump into. Send the word on the channel and the next entry covers it.</p>",
        '<a class="g-cta-btn" href="/method/">How the desk works <span aria-hidden="true">&#8594;</span></a>',
        "</section>",
      ].join(""),
    }),
  );

  return ENTRIES.length;
}
