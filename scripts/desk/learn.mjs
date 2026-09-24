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
  {
    slug: "why-ai-hallucinates",
    title: "Why AI hallucinates, and how to catch it before it costs you",
    dek: "AI hallucinations are not a bug. They are how the model works. Why they happen, how to spot a confident wrong answer, and what actually prevents them.",
    kind: "Explainer",
    level: "Intermediate",
    date: "2026-09-25",
    reading: 13,
    body: [
      {
        h: "The short answer first",
        kind: "prose",
        p: [
          "A hallucination is a confident wrong answer. It happens because a language model does not look things up. It predicts the next likely word, one piece at a time, from patterns it absorbed during training. Most of the time those patterns line up with the truth. Sometimes they do not, and nothing inside the model flags the difference.",
          "These failures are what the field calls hallucinations, and what everyone means when they say AI hallucinates. You cannot switch the behavior off. There is no fact-check module to enable and no instruction that removes it. Every lab documents hallucination as a limitation in its own model card, and every model ships with it intact.",
          "What you can do is understand the mechanism, learn to spot the failures, and put a small set of habits between the model and anything that matters. That is what this guide is. It starts at zero, ends at a system you can actually run, and skips the hype in between.",
        ],
      },
      {
        kind: "callout",
        tone: "note",
        label: "The sentence to keep",
        p: [
          "A language model does not know things. It assigns probabilities to words. The confidence you read in an answer is a property of the text style, not a report from a memory.",
        ],
      },
      {
        h: "What a hallucination is not",
        kind: "prose",
        p: [
          "The word gets used for everything a model gets wrong, which makes it useless. Four of the rows below are not hallucinations at all, and each needs a different fix. The last row is the thing itself.",
        ],
        ul: [
          "A refusal is not a hallucination. When the model says it will not answer, that is a guardrail doing its job. You can disagree with the guardrail, but it is not a fiction.",
          "An out-of-date answer is not a hallucination. It is a training-cutoff problem, fixed by giving the model newer text, not by changing how it writes.",
          "A misinterpretation of a vague prompt is not a hallucination. If you ask an unclear question and get an answer to the question you actually asked, the model did what it was told.",
          "A limitation is not a hallucination. A model that cannot do reliable arithmetic is showing you a boundary, not inventing a fact.",
          "A hallucination is specifically this: the model states something specific, uses the same assured style it uses for everything else, and the statement is false. The confidence is the tell, because the confidence is always on.",
        ],
      },
      {
        h: "The words you need",
        kind: "terms",
        terms: [
          ["Hallucination", "A confident, specific, false statement produced by a model. Not a lie, because there is no intent to deceive, and not an error the model can detect in itself."],
          ["Confabulation", "The same behavior, named by analogy to a condition where a person fills memory gaps with plausible false detail and believes the result. Some papers prefer this word because it is closer to the mechanism. You will see both, and they mean the same thing here."],
          ["Grounding", "Tying an answer to a specific source that existed before the question was asked. An answer is grounded when you can point at the paragraph it came from, not when it merely sounds researched."],
          ["Next-token prediction", "The actual task a language model performs: given the text so far, guess the next piece. Every fluent sentence, every correct fact, and every hallucination comes out of this same loop."],
          ["Calibration", "How well the stated confidence of a model matches its real accuracy. A well-calibrated model that says it is 70 percent sure is right about 70 percent of the time. Most models are overconfident, which is why a hallucination never arrives with a warning attached."],
          ["Citation", "A pointer to a source. A real citation names a document that exists and contains the claim. A hallucinated citation often names a real journal, a real author, a plausible title, and a volume that does not exist. Checking it is the highest-value habit on this list."],
          ["RAG", "Retrieval-augmented generation. The system searches your documents first, then hands the relevant parts to the model to answer from. It cuts hallucination sharply when retrieval works, and it fails silently when retrieval returns the wrong document, which is the advanced failure to watch for."],
          ["Eval", "A fixed set of questions with known answers, used to measure how often a pipeline gets it wrong. Without one you are relying on how the output feels, and confident wrong output feels fine."],
        ],
      },
      {
        h: "Why the wrong answer sounds exactly like the right one",
        kind: "prose",
        p: [
          "The model was trained on enormous amounts of human writing, and human writing is full of assured, fluent statements. The model learned to produce that register, and it applies it uniformly. There is no internal step where it pauses to ask whether a sentence is true, because truth-checking is not part of next-token prediction.",
          "From inside the loop there is no difference between a correct sentence and an invented one. Both are just the highest-probability continuation. That is why reading a response for confidence tells you nothing. The confidence is constant.",
          "This also explains where the errors cluster. Proper nouns, numbers, dates, citations, and web addresses are low-probability guesses dressed up as high-confidence prose. Anything that requires several steps of reasoning before the answer is where drift accumulates. Facts the model saw constantly during training are usually right. Facts it saw once, or never, are where it starts writing plausible fiction.",
        ],
      },
      {
        kind: "quote",
        quote: "The model does not know it is wrong, because there is nothing that checks. There is only the next word.",
        cite: "the desk, on why confidence is never evidence",
      },
      {
        h: "The five hallucinations you will actually meet",
        kind: "prose",
        p: [
          "Most wrong output falls into five shapes. Learning to name them as you read is faster than learning to spot them by feel, and the shape tells you which fix to reach for.",
        ],
        ul: [
          "The invented citation. A paper, author, title, and page that look exactly right and do not exist. Dangerous, because the reference reads as more credible than the claim it supports.",
          "The real name, wrong detail. A genuine researcher attached to a plausible finding they never published. Harder to catch than a pure invention, because the name checks out and only the work is false.",
          "The plausible statistic. A number that feels sourced, often round, often in the right range. It is rarely exactly right, and it never comes with an origin you can open.",
          "The broken artifact. Code that is structurally close to correct and fails on one line, or a formula that is right except for the constant it invented. Reads as competent, runs as broken.",
          "The agreeable fiction. You state a wrong premise and the model builds on it instead of correcting it. This is the one you cause yourself, and it is the easiest of the five to prevent.",
        ],
      },
      {
        h: "How to spot one in the wild",
        kind: "steps",
        items: [
          { t: "Read the load-bearing sentences only", d: "Most of a response is connective prose. Mark the two or three sentences the answer actually depends on. Those are the only ones worth checking, and they are usually the ones carrying the numbers and names." },
          { t: "Check what one search can check", d: "Names, dates, titles, links, and any number the argument rests on. If the model wrote a citation, open it. A link that returns an error page, or a paper that does not exist, is a hallucination confirmed in a few seconds." },
          { t: "Ask for the source passage verbatim", d: "Reply with a single request: quote the exact text this comes from. A grounded answer produces the passage. A hallucination produces another confident paragraph that still has no origin, or quietly retreats to a vaguer claim." },
          { t: "Watch for the agreeable fiction", d: "If you handed the model a premise, ask whether it accepted it. Then ask it to argue the opposite as well. A model that only extends what you gave it is continuing your text, not verifying it." },
          { t: "Ask where it is least sure", d: "Ask which parts it would change its mind on, and what evidence would flip the answer. The shape of the reply is more useful than the confidence in it, because a hallucinating model lists the same kind of detail either way." },
          { t: "Run the same question twice", d: "Ask again in a fresh session with different phrasing. A fact is stable across runs. A hallucination drifts, because it is rebuilt from probability each time and the wording changes what gets drawn." },
        ],
      },
      {
        kind: "callout",
        tone: "warn",
        label: "The one that costs the most",
        p: [
          "Invented citations are the most expensive hallucination, because they survive human review. A reader skimming a well-formed reference treats it as evidence. The journal is real, the author publishes in that field, the format is correct. Only the specific paper is false. The habit that pays for itself is checking the citation, not reading the prose around it.",
        ],
      },
      {
        h: "What does not fix hallucinations",
        kind: "prose",
        p: [
          "A lot of the standard advice does not work, and knowing which part is which is half the savings. Four remedies get recommended constantly and deliver much less than their reputation suggests.",
        ],
        ul: [
          "A bigger model does not fix it. Capability reduces some classes of error, and hallucination falls by roughly the same proportion as everything else. It never reaches zero, and the errors that remain are harder to spot because the surrounding output is better.",
          "Setting the temperature to zero does not fix it. It makes output more consistent, which means you get the same hallucination every time instead of a different one each time. That is more predictable, not more true.",
          "Telling the model to be accurate does not fix it. It will agree to be accurate, in the same confident style, and then produce output with a similar error rate. Instruction changes behavior, not the mechanism underneath.",
          "Adding retrieval does not automatically fix it. It moves the failure from no source to wrong source, which is a better problem to have and still a problem. Retrieval that returns the wrong chunk produces a confident answer about the wrong document, and nothing in the output tells you it happened.",
        ],
      },
      {
        h: "The four habits that actually prevent them",
        kind: "steps",
        items: [
          { t: "Make the model quote before it claims", d: "Require the source passage first, in quotation marks, then the claim drawn from it. A model that must produce the excerpt before the sentence either finds the excerpt or runs out of excerpt. This one habit removes most invented citations on its own." },
          { t: "Verify only what carries weight", d: "You cannot check every sentence and you do not need to. Check the names, the numbers, the links, and the claims the decision rests on. Verification effort should follow consequence, not word count." },
          { t: "Split the writer from the checker", d: "Generate, then in a separate pass with a separate instruction, have the model or a second model try to break the answer. Give the checker the sources and tell it to find the unsupported sentence. A critic told to criticize finds what a summarizer told to summarize smooths over." },
          { t: "Keep the decision where a person can see it", d: "Any output that leads to money, a published claim, a medical or legal decision, or anything sent under your name should pass a checkpoint that knows which sentences to doubt. The model can draft. It should not be the last reader." },
        ],
      },
      {
        h: "A grounding prompt you can reuse",
        kind: "code",
        lang: "txt",
        lines: [
          "You are answering only from the SOURCE TEXT below. Follow the rules in order.",
          "",
          "1. Before any claim, quote the exact sentence from the source that supports it.",
          "   Start the quoted line with the greater-than character. Quote more than one if needed.",
          "2. If the source does not contain the answer, write: NOT IN SOURCE.",
          "   Do not fill the gap from memory. Say the gap is there.",
          "3. Never name a paper, link, author, date, or number that is not in the source.",
          "4. If a number in the source conflicts with what you recall, trust the source.",
          "5. At the end, list the claims you are least sure about, one per line.",
          "",
          "SOURCE TEXT:",
          "<<<",
          "(paste the document here)",
          ">>>",
        ],
      },
      {
        h: "If you build on an API",
        kind: "prose",
        p: [
          "When the model is one component inside a product, the failure moves. Most hallucination in production is not a model inventing freely. It is the retrieval layer handing the model the wrong document, and the model answering confidently from that. The output looks grounded, because it is grounded in something. It is just grounded in the wrong thing.",
          "Three checks catch most of it. Confirm the retrieved chunk actually contains the answer the model gave, not merely text on the same topic. Confirm chunking does not split a claim away from its qualification, which is how a model ends up answering with half a sentence. And run a fixed eval of real user questions with known answers, so you are measuring error instead of gathering impressions.",
          "None of this is exotic work. It is the boring middle of the project, and it is the part that decides whether the thing ships once or ships every month.",
        ],
      },
      {
        h: "How to measure it instead of feeling it",
        kind: "prose",
        p: [
          "You cannot improve what you do not measure, and hallucination is specifically invisible to review based on impressions. Build a small set of questions where you already know the right answer, preferably taken from real usage, and run the pipeline against them on every change. Track how often it produces a confident wrong answer, and track the two failure types separately: no source found, and wrong source used.",
          "Sample human review on a fixed cadence, and sample it at random. Reviewing only the outputs that look suspicious measures your ability to spot errors, not the error rate of the pipeline. A random one-in-twenty sample tells you the real number, and the real number is usually higher than the impression.",
        ],
        ul: [
          "Log the question, the retrieved context, and the answer together. When something fails, the three side by side show which layer caused it.",
          "Keep adversarial cases in the set: questions with false premises, questions whose answer is genuinely absent, and questions that ask for a citation. These are the ones a model fails by default, and watching them move is the earliest signal that a change actually helped.",
        ],
      },
      {
        kind: "callout",
        tone: "tip",
        label: "The cheapest fix that works today",
        p: [
          "If you do one thing after this guide, do this: paste the document into the chat, tell the model to answer only from that text, and tell it to write NOT IN SOURCE when the answer is not there. The instruction costs nothing, takes ten seconds, and removes the invented-reference class of failure immediately. Everything else in this guide is reinforcement for that one line.",
        ],
      },
      {
        h: "How the desk handles this",
        kind: "prose",
        p: [
          "The desk has this problem by design. It summarizes what labs publish, which means its output is a set of claims about sources. A confident summary that says something the source does not say would be exactly the failure described above.",
          "The practice is the same one this guide recommends to you. Every brief carries its primary source link, placed where a reader can open it in one click. The summary keeps the first sentences of the source rather than rewriting them, so the desk is not asserting a paraphrase it invented. Where a source is silent, the desk says so instead of filling the gap from memory, because memory is exactly where the model is wrong and confident at the same time.",
          "It is not a perfect defense. It is a specific one, and you can check it against any brief on the board right now.",
        ],
      },
      {
        h: "The honest limit",
        kind: "prose",
        p: [
          "There is no version of this where the number reaches zero. Hallucination is not a defect sitting on top of the model waiting to be patched out. It is the same mechanism that produces the fluent, useful output, and you do not get one without the other.",
          "What you get instead is a floor, and the knowledge of where it sits. The model drafts, the process verifies, the person decides. The distance between a high hallucination rate and a low one is not a setting. It is the set of habits above, run every time, on the sentences that carry weight.",
          "Keep the citation, not the confidence.",
        ],
      },
    ],
  },
  {
    slug: "prompt-mistakes",
    title: "Six prompt mistakes everyone makes, and the small fix for each",
    dek: "Most bad AI answers come from the prompt, not the model. Six mistakes everyone makes, why each fails, and the one-line fix that changes the answer.",
    kind: "Tutorial",
    level: "Beginner",
    date: "2026-09-25",
    reading: 7,
    body: [
      {
        h: "Why the prompt is usually the problem",
        kind: "prose",
        p: [
          "A model gives you the most likely answer to the question you actually asked. When the answer comes back useless, the model usually answered correctly and the prompt was the problem. That is good news, because the prompt is the one part you fully control.",
          "The six mistakes below are not theory. They are the patterns behind nearly every session that goes sideways, and each one has a fix that costs one or two extra sentences. None of them need a different model, a paid plan, or any technical background.",
          "Read them as a checklist against something you are working on right now, not as a list to memorize. If one of them describes your prompt, that is the one to fix first.",
        ],
      },
      {
        kind: "callout",
        tone: "note",
        label: "The 30-second test",
        p: [
          "Take a prompt that gave you a bad answer and ask it again, word for word, in a fresh chat. You will get a similarly bad answer. That is the proof the prompt is the variable and not the model, and it is the fastest way to stop blaming the tool.",
        ],
      },
      {
        h: "The words that come up",
        kind: "terms",
        terms: [
          ["System prompt", "The standing instructions that apply to the whole conversation, set before your first message. This is where the role, the tone, and the rules belong. Putting them here instead of repeating them in every message keeps behavior stable across a long chat."],
          ["Few-shot", "Giving the model examples of the output you want inside the prompt. Two or three examples teach a format far more reliably than a description of it, which is why this is the standard fix for shape problems."],
          ["Zero-shot", "Asking with no examples at all. Perfectly fine for simple tasks, and the reason simple tasks sometimes come back in a shape you did not want."],
          ["Temperature", "The setting that controls how predictable the output is. Low is steady and repetitive, high is varied and less reliable. Keep it low for facts and formatting, raise it for ideas and drafts. Most people never touch it and do not need to."],
          ["Persona", "Telling the model who to be. Useful as a shortcut to a tone and a viewpoint, misleading when it makes the output sound more authoritative than the underlying answer actually is."],
          ["Chain of thought", "Asking the model to show its working before it gives the answer. It measurably helps on multi-step problems, because the model gets to use its own intermediate lines as context for the final one."],
        ],
      },
      {
        h: "Vague requests get vague answers",
        kind: "prose",
        p: [
          "The mistake is asking for something general. Write a summary. Make this better. Help me with my report. None of these tell the model what a good answer looks like, so it gives you the most average possible thing, and its fluency makes that average look intentional.",
          "The fix is to name the output, the reader, and the shape. Write a summary becomes: write a 200-word summary of this for a team that has not read it, with a one-line takeaway at the top. Constraints are what make a prompt specific, and specific prompts are what get specific answers.",
        ],
      },
      {
        h: "Asking for everything in one go",
        kind: "prose",
        p: [
          "The mistake is stacking five tasks into a single prompt so the model has to hold them all at once. The result is usually one task done acceptably and four done badly, and you cannot tell which is which because it all arrives as one wall of text.",
          "The fix is to split the job into steps and run them separately. Ask for the outline first, then expand one section, then check the result. Each step gets the full attention of the model, and you get to redirect before the wrong work multiplies.",
        ],
      },
      {
        h: "No examples and no format",
        kind: "prose",
        p: [
          "The mistake is describing what you want in words when one example would settle it. Format, tone, and structure are all far easier to show than to tell, and a model told to sound professional still has to guess what professional means to you.",
          "The fix is to paste one example of the output you want, even a rough one, and say match this. If you want a table, write the header row. If you want a tone, quote two sentences of it. A single example removes more ambiguity than three paragraphs of description.",
        ],
      },
      {
        h: "Accepting the first answer",
        kind: "prose",
        p: [
          "The mistake is treating the first reply as the answer. A first pass is a draft produced without any feedback, and it is usually the least informed version of what the model can do for you. Most people stop here and then conclude the tool is limited.",
          "The fix is to answer the answer. Say what is wrong, what is missing, and what to keep. Second and third passes are where the model earns its keep, because now it is iterating against your actual judgment instead of guessing at it.",
        ],
      },
      {
        h: "Feeding your assumptions in",
        kind: "prose",
        p: [
          "The mistake is baking your conclusion into the prompt, sometimes so quietly that you do not notice. Asking for reasons this plan will work is asking the model to agree with you. A model asked to confirm will confirm, confidently, whether or not the plan is sound.",
          "The fix is to ask for the evaluation, not the confirmation. Say: review this and tell me the strongest reason it fails, then the strongest reason it works. You get far more useful criticism from a prompt that invites opposition than from one that requests support.",
        ],
      },
      {
        h: "No context about who or why",
        kind: "prose",
        p: [
          "The mistake is writing the task without writing the situation. The model does not know you are writing to a client who already rejected this idea, or that the reader is twelve, or that you have ten minutes and need a decision. It answers the same question the same way for everybody.",
          "The fix is two sentences of context at the top: who reads this, what they already know, and what happens after they read it. Those two sentences change the answer more than any amount of rewording the question itself.",
        ],
      },
      {
        h: "The six fixes as a checklist",
        kind: "steps",
        items: [
          { t: "Name the output, the reader, and the shape", d: "Turn a general request into a constrained one. Say what the thing is, who it is for, and what shape it arrives in." },
          { t: "Split stacked tasks into steps", d: "One job per message. Ask for the structure, then the sections, then the check. Redirect between steps instead of after everything." },
          { t: "Paste one example instead of describing", d: "Show the format with a sample. A header row, two sentences of tone, or a rough draft teaches shape faster than any description." },
          { t: "Reply to the first answer", d: "Treat the first pass as a draft. Tell it what is wrong and what to keep before you give up on the task." },
          { t: "Ask for the evaluation, not the confirmation", d: "Invite opposition. Ask for the strongest reason the idea fails, and you get criticism you can actually use." },
          { t: "Give two sentences of context", d: "Who reads it, what they know, what happens next. Context changes the answer more than phrasing does." },
        ],
      },
      {
        h: "A template that avoids all six",
        kind: "code",
        lang: "txt",
        lines: [
          "Here is what I need, and here is the situation.",
          "",
          "ROLE: (who is writing this, and to whom)",
          "READER: (what the reader already knows about the topic)",
          "TASK: (the single thing to produce, in one sentence)",
          "SHAPE: (the format, the length, and the structure of the output)",
          "EXAMPLE: (one sample of the tone or layout, or write NONE)",
          "",
          "Rules:",
          "- If the task is unclear, ask me one question before you answer.",
          "- Give the answer, then name the one part you are least confident about.",
          "",
          "CONTEXT:",
          "<<<",
          "(paste the material here)",
          ">>>",
        ],
      },
      {
        kind: "callout",
        tone: "tip",
        label: "If you only change one thing",
        p: [
          "Add context before you add anything else. Two sentences about who reads the output and why fixes more bad answers than the other five fixes combined, and it is the only one that works on every model and every task.",
        ],
      },
      {
        h: "How to know it worked",
        kind: "prose",
        p: [
          "Run the same task with the old prompt and the new one, an hour apart, and read both back to back. The difference is usually obvious enough that you will not need a scoring system. If it is not, the prompt was not the variable, and the problem lives somewhere else.",
          "None of this is prompt engineering in the technical sense. It is the habit of writing down what you actually want before you ask for it, which is the same skill that makes instructions work on humans.",
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
