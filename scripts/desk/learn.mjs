// The desk's field guide — original explainers, written for this site only.
// Nothing here is copied from anywhere. Each entry is a self-contained
// explainer that lives at /learn/<slug>/ and is linked from the nav once it
// exists. Unlike the board, these do not expire: they are reference material.
import { SITE, esc, clip } from "./core.mjs";
import { jsonLdScript, shell } from "./render.mjs";
import { write } from "./net.mjs";

// The guide's own voice: short sentences, one idea per paragraph, no
// buzzwords left undefined. Every term that appears in bold is either
// explained in the same paragraph or is common English.
const ENTRIES = [
  {
    slug: "ai-vocabulary",
    title: "The AI vocabulary, unpacked",
    dek: "Every acronym the labs use in their announcements, explained in plain language. No prior knowledge assumed, none required.",
    kind: "Explainer",
    date: "2026-09-21",
    reading: 9,
    body: [
      {
        h: "Why this exists",
        p: [
          "The labs publish fast. OpenAI ships, Anthropic replies, Google previews, and within an hour the same three acronyms are everywhere. The announcements assume you already know what they mean. Most people do not, and the definitions you find online are usually written for someone who already works in the field.",
          "This guide is the opposite. It assumes nothing. Each term below gets one short explanation in everyday language, plus where you will actually see it — because a term you can define but never notice is a term you will forget by Friday.",
          "If you read the desk's board, these are the words in the headlines. Learn them once and the board reads differently.",
        ],
      },
      {
        h: "The model itself",
        p: [
          "<b>LLM</b> — large language model. A program trained on enormous amounts of text until it can predict the next word in a sentence. That prediction is the whole trick. It does not know facts the way a database does; it knows which words tend to follow which other words. When it sounds certain, that is the style of the training data, not evidence of confidence.",
          "<b>Parameters</b> — the numbers inside the model that got adjusted during training. A bigger parameter count usually means a model that handles harder questions, and always means one that costs more to run. When a lab says 700B, that is 700 billion of these numbers.",
          "<b>Context window</b> — how much text the model can hold in mind at once, measured in tokens. A small window forgets the beginning of a long document before it reaches the end. A large one can read a whole book and still answer questions about page one. Labs treat this as a headline feature now, because it is what makes long documents and long conversations actually work.",
          "<b>Token</b> — a chunk of text, roughly three-quarters of a word for English. Models do not see words or letters; they see tokens. Pricing, context windows, and speed limits are all counted in these.",
          "<b>Training</b> — the process of reading all that text and adjusting the parameters until predictions get good. It is expensive, slow, and the reason only a handful of companies ship frontier models.",
          "<b>Inference</b> — running the trained model to produce an answer. This is what you pay for when you use an API, and it is why a bigger model is not always the right one — inference cost scales with size.",
        ],
      },
      {
        h: "How a model is taught to behave",
        p: [
          "<b>Pre-training</b> — the first and biggest stage. Read the internet, learn to predict text. At the end of this the model can write fluently and knows a great deal, but it has no notion of being helpful, honest, or safe. It will complete any sentence, including ones nobody wants completed.",
          "<b>Fine-tuning</b> — practice on a smaller, curated set of examples to shift the model's behavior. After pre-training a model writes like everything it read; after fine-tuning it writes like the examples it was shown. This is where a lab's actual character comes from.",
          "<b>SFT</b> — supervised fine-tuning. The lab shows the model good answers and has it imitate them. Straightforward, effective, and limited by how good the examples are.",
          "<b>RLHF</b> — reinforcement learning from human feedback. Instead of showing answers, humans rank answers. The model then adjusts to produce the kind of answer that ranked well. This is what made the first ChatGPT feel usable instead of merely fluent. It is also where a model learns to be evasive, because refusing politely tends to rank safely.",
          "<b>DPO</b> — direct preference optimization. A newer, cheaper way to get most of RLHF's effect without a separate reward model. You will see it in release notes because it is the reason smaller labs can now ship well-behaved models.",
          "<b>Alignment</b> — the broad project of making a model do what was actually intended rather than what was literally asked. There is no finished version of this. Every lab has a team for it and every lab defines success differently, which is why two models can be equally capable and behave nothing alike.",
        ],
      },
      {
        h: "The acronyms in architecture",
        p: [
          "<b>Transformer</b> — the design behind essentially every modern model. Its key idea is attention: instead of reading word by word, it looks at the whole passage at once and decides which parts matter. That single change is why models got good enough to be useful.",
          "<b>Attention</b> — the mechanism of deciding what to pay attention to. When a model reads \"the bank,\" attention is what tells it whether the surrounding words are about money or about a river. It is weights, not a thinking process, but the effect is the same.",
          "<b>MoE</b> — mixture of experts. Instead of one giant model answering every question, several smaller specialist models sit inside, and a router sends each token to the right one. The model can be very large overall while each answer only activates part of it, which makes strong models affordable to run. Most frontier models are now built this way, and the labs rarely shout about it.",
          "<b>Multimodal</b> — a model that takes more than one kind of input, usually text plus images, sometimes audio and video. The hard part is not adding the second input; it is making the model connect the two meaningfully, which is still where results get unreliable.",
          "<b>Embedding</b> — turning text into a list of numbers so that similar meanings sit close together. This is the quiet workhorse of search, recommendation, and retrieval. When a tool finds the right document without matching your exact keywords, an embedding did that.",
        ],
      },
      {
        h: "What a model actually ships as",
        p: [
          "<b>API</b> — the interface another program uses to talk to the model. Most AI products do not contain a model; they call one of these. When a lab reports enterprise traction, this is usually where the money is.",
          "<b>Agent</b> — a program that calls a model repeatedly, decides its own next step, and can use tools — search, code, a browser — instead of only answering. The word is used loosely. A real agent acts; a chatbot with a search box does not, no matter how it is marketed.",
          "<b>RAG</b> — retrieval-augmented generation. Before answering, the system searches a private document set and hands the relevant parts to the model. This grounds the answer in something specific and current, which is why it is the standard pattern for enterprise AI. It also means the answer is only as good as the retrieval, and retrieval fails silently.",
          "<b>Guardrails</b> — the filters and rules layered on top of a model to block disallowed output. They are separate from the model and often visible: a refusal that appears before an answer is a guardrail, not an opinion.",
          "<b>Open weights</b> — a model whose parameters are published so anyone can run them. This is not the same as open source: the training data and method are usually absent. The distinction matters, and the labs that ship open weights prefer the looser term.",
        ],
      },
      {
        h: "The ones people argue about",
        p: [
          "<b>AGI</b> — artificial general intelligence, a machine that can do most economically useful things a human can. Every lab has its own definition, which is convenient, because it lets each one claim progress toward a finish line nobody drew in the same place. Treat any AGI announcement as a claim about definitions first and capability second.",
          "<b>Reasoning</b> — in a model's release notes, this means it was trained to spend more steps on hard problems, often by producing intermediate work before the final answer. It is a real and measurable improvement on math, code, and logic. It is not the human faculty of reasoning, and the gap between the two is where most overreach in coverage happens.",
          "<b>Alignment tax</b> — the measurable performance a model gives up to be safe. It is real, labs measure it, and the honest argument in the field is about how much of it is worth paying.",
          "<b>Hallucination</b> — a confident wrong answer. The model is not lying; it is doing exactly what it was built to do, producing the most likely next words, and those words happen to be false. The error is structural, not a bug that a patch removes. This is why the desk keeps the primary source on every brief.",
        ],
      },
      {
        h: "How to use this guide",
        p: [
          "Pick one section that matches what you see on the board today. If a lab announces a new model, the first three sections explain what is actually new. If the story is about a product or an enterprise deal, the fifth section is the one that applies.",
          "The terms above do not change quickly. The marketing around them does. When a new acronym appears in a headline and is not here, it is almost always a new name for one of the ideas above, and the desk will file it as such.",
        ],
      },
    ],
  },
];

export async function writeLearn() {
  for (const e of ENTRIES) {
    const url = "/learn/" + e.slug + "/";
    const sections = e.body
      .map(
        (s) =>
          "<section><h2>" +
          esc(s.h) +
          "</h2>" +
          s.p.map((para) => "<p>" + para + "</p>").join("") +
          "</section>",
      )
      .join("");

    await write(
      "learn/" + e.slug + "/index.html",
      shell({
        title: e.title + " — Lab Ledger Desk",
        description: clip(e.dek, 158),
        path: url,
        ogType: "article",
        body: [
          '<article class="guide">',
          '<p class="kicker">' + esc(e.kind) + " · " + esc(e.date) + " · " + e.reading + " min read</p>",
          "<h1>" + esc(e.title) + "</h1>",
          '<p class="dek">' + esc(e.dek) + "</p>",
          sections,
          '<p class="kicker">Filed by the desk</p>',
          '<p>Original explainer for Lab Ledger Desk. Not syndicated. The board this guide explains is at <a href="/">today\'s board</a>, and the method behind it is on <a href="/method/">the method page</a>.</p>',
          "</article>",
        ],
        extra: jsonLdScript({
          "@context": "https://schema.org",
          "@type": "Article",
          headline: e.title,
          description: clip(e.dek, 300),
          datePublished: e.date,
          dateModified: e.date,
          author: { "@type": "Organization", name: "Lab Ledger Desk" },
          publisher: {
            "@type": "NewsMediaOrganization",
            name: "Lab Ledger Desk",
            url: SITE + "/",
            logo: SITE + "/og.jpg",
          },
          mainEntityOfPage: SITE + url,
        }),
      }),
    );
  }

  // The index lists every guide. It is the page the nav points at.
  const list = ENTRIES.map(
    (e) =>
      '<article class="row guide-row"><div><div class="kicker">' +
      esc(e.kind) +
      " · " +
      esc(e.date) +
      " · " +
      e.reading +
      ' min</div><a class="headline" href="/learn/' +
      e.slug +
      '/">' +
      esc(e.title) +
      '</a><div class="dek">' +
      esc(e.dek) +
      "</div></div></article>",
  ).join("");

  await write(
    "learn/index.html",
    shell({
      title: "Field guide — Lab Ledger Desk",
      description:
        "Original AI explainers from the desk. Every term the labs use, in plain language. Written for this site, not copied.",
      path: "/learn/",
      body: [
        '<article class="method">',
        '<p class="kicker">Field guide</p>',
        "<h1>The desk's field guide</h1>",
        '<p class="dek">The board files what the labs moved. This guide explains the words they used to move it. Every entry below is written for this site — nothing is copied, nothing is syndicated — and each one is kept current rather than left to rot.</p>',
        "<h2>Why it is written this way</h2>",
        "<p>The desk reads official announcements all day, and the same gap appears every time: the announcement assumes vocabulary the reader has not been given. Rather than link out to a definition that itself assumes too much, the guide explains the term from nothing. Short sentences, one idea per paragraph, and no word left undefined.</p>",
        "</article>",
        '<section class="board"><div class="board-head"><span>Guides</span><span>' +
          ENTRIES.length +
          " published</span></div>" +
          list +
          "</section>",
      ],
      extra: jsonLdScript({
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        name: "Lab Ledger Desk field guide",
        url: SITE + "/learn/",
        description: "Original AI explainers, written for this site.",
        publisher: { "@type": "NewsMediaOrganization", name: "Lab Ledger Desk", url: SITE + "/" },
      }),
    }),
  );

  return ENTRIES.length;
}
