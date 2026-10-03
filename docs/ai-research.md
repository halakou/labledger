# Lab Ledger Desk — AI API integration research

**Date:** 2026-10-03 (Asia/Tehran)  
**Scope:** Research only. No implementation, no commits.  
**Repo:** [halakou/labledger](https://github.com/halakou/labledger) (`main`)  
**Live:** https://labledgerdesk.pages.dev  
**Hard rule:** AI must not fabricate news. It may only transform, tag, cluster, or summarize **text already present** in allow-listed RSS / listing / GitHub release items the desk already fetched.

---

## 1. Current pipeline (read-only findings)

From `AGENTS.md`, `scripts/desk/config.mjs`, `scripts/desk/core.mjs`, `cloudflare/wrangler.toml`:

| Stage | Where it runs | What it does |
| --- | --- | --- |
| Ingest | GitHub Actions (`pages.yml` → `node scripts/build-desk.mjs`) | Fetch ~27 allow-listed sources (18 labs + 9 open projects), parse RSS/Atom/listing, dedupe by `guid` |
| Brief shape | `core.mjs` | Title/link/summary from feed; `composeWhat` clips **source summary**; `composeWhy` states lab/date/kind/topics only — **no invented analysis** |
| Classify | `classifyKind` / `classifyTopics` | **Keyword** tagging (launch/research/note + up to 2 topics) — already “auto-tag”, not LLM |
| Publish | Actions → Cloudflare Pages + Worker assets; then Telegram | Site before Telegram; free tiers only |
| Watchdog | Worker `labledger-desk` cron `*/5` | Staleness check + dispatch; KV `DESK`; **no AI binding today** |

**Invariants that constrain any AI plan**

1. **Nothing invented** — briefs only from allow-list; never paraphrase into a claim the source did not make (`AGENTS.md` invariant 4).  
2. **Zero runtime npm deps** — pure Node 22; AI must be HTTPS/`fetch` or a CF binding, not a new package.  
3. **Free tier forever** — no paid Workers / Groq / Gemini plan required to ship.  
4. **No laptop dependency** — work stays in Actions + Cloudflare.  
5. **Secrets server-side only** — GHA secrets / Worker secrets; never in browser or static Pages JS.  
6. Prior free-tools guidance already **rejected “Workers AI as writer”** inventing desk copy; this research only considers **grounded** uses.

---

## 2. Free-tier AI providers (Workers-compatible)

### Cloudflare Workers AI

| | |
| --- | --- |
| **Fit** | Native `AI` binding on Workers; no third-party key if used only on Worker. Also callable via REST with CF token from Actions. |
| **Free** | **10,000 Neurons / day** (Free and Paid); reset 00:00 UTC. Above that needs Workers Paid ($0.011 / 1k Neurons). |
| **Rate (docs)** | Text generation default **~300 RPM** (task-type limits); some large models require Workers Paid (403). |
| **Workers** | Excellent — designed for Workers. |
| **Caveats** | Neuron budget is the real ceiling for many briefs/day. Capacity errors (`429` / out-of-capacity) happen on free. Large frontier models may be Paid-only. |

Sources: [Workers AI pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/), [limits](https://developers.cloudflare.com/workers-ai/platform/limits/).

### Groq

| | |
| --- | --- |
| **Fit** | OpenAI-compatible HTTPS from Actions or Worker `fetch`. |
| **Free** | Free API key; limits are **per organization**. Exact RPM/RPD/TPM **per model** — check console; docs table changes often. Typical chat models on free ~**30 RPM**, RPD often **~1k** (some small models higher). |
| **Workers** | Compatible via `fetch` + secret; not a CF binding. |
| **Caveats** | External dependency + secret hygiene; daily RPD can block a busy desk day; free-tier reliability not a SLA. |

Source: [Groq rate limits](https://console.groq.com/docs/rate-limits).

### Google Gemini API

| | |
| --- | --- |
| **Fit** | HTTPS from Actions/Worker; free tier for some models. |
| **Free** | Free tier exists; **RPM/TPM/RPD are per project and model** — live numbers only in [AI Studio](https://aistudio.google.com). Docs do not publish a fixed public free-tier table. |
| **Workers** | Compatible via `fetch` + secret. |
| **Caveats** | Free-tier data may be used to improve Google products (paid tiers differ). Quotas change with account tier. Extra vendor + ToS surface vs CF-native. |

Source: [Gemini rate limits](https://ai.google.dev/gemini-api/docs/rate-limits), [billing](https://ai.google.dev/gemini-api/docs/billing).

### Provider pick (research recommendation)

| Priority | Provider | Why |
| --- | --- | --- |
| 1 | **Workers AI** (small instruct + embeddings) | Already on CF; no third-party key; matches “free CF forever” |
| 2 | **Groq** (batch from Actions) | Fast; good for occasional cluster summaries if Worker AI neurons are tight |
| 3 | **Gemini** | Strong models, but extra ToS/quota opacity — only if needed |

**Run location preference:** batch jobs in **GitHub Actions** during/after `build-desk.mjs` (keys in GHA secrets), *or* a **scheduled Worker** path that writes JSON into KV / triggers rebuild — **not** browser. Avoid calling AI on every `*/5` watchdog tick.

---

## 3. Use-case evaluations

### UC1 — AI “analyzes” RSS instead of republishing

| | |
| --- | --- |
| **What** | Model reads each item and writes the desk’s “what / why” (or replaces the brief body). |
| **Free-tier** | Technically yes (few dozen–hundred calls/day fit Groq/Gemini free or careful Workers AI), but neuron/RPD cost scales with feed volume (~27 sources × `PER_FEED`). |
| **Approach** | Prompt: quote-only / “NOT IN SOURCE” rules; output JSON `{what, citations[]}` validated against feed text; reject if claims lack substring overlap. |
| **Risks** | **High** — directly threatens invariant “Nothing invented.” Prior humanizing attempts already conflicted with trust. Hallucinated “analysis” looks like news. |
| **Verdict** | **No** as replacement for current `composeWhat` / primary brief. **Later** only as an *optional* secondary field clearly labeled “model notes from source text,” never as the filed claim. |

### UC2 — Auto-categorize / tag

| | |
| --- | --- |
| **What** | Assign kind + topics (and maybe new tags) with an LLM. |
| **Free-tier** | Easy — classification is short I/O; Workers AI text-classification / small LLM or Groq 8B fits free. |
| **Approach** | Pass title+summary; constrain output to existing `KINDS` / `TOPICS` enums; fallback to today’s keyword `classifyKind` / `classifyTopics` on parse failure. |
| **Risks** | Low fabrication risk if tags are closed-set. Drift vs keyword rules; extra cost/latency for little gain — **keywords already ship**. |
| **Verdict** | **Later** (low priority). Feasible now, but **not needed**; improve keyword lists first (zero AI). |

### UC3 — Aggregate ~10 related items into one AI summary (new section)

| | |
| --- | --- |
| **What** | Cluster related briefs; publish e.g. `/digest/cluster/…` or home module: “N filings on X — summary + links.” |
| **Free-tier** | **Yes** if run **once per build or once daily**, not per source. One prompt with 8–12 short briefs (~2–4k tokens) fits free tiers. Workers AI neurons or Groq RPD OK at that cadence. |
| **Approach** | (1) Cluster by shared topic / embedding similarity / same lab+day. (2) Prompt with **only** those briefs’ title, clipped what, source URL. (3) Require every sentence to map to ≥1 URL; UI lists all sources. (4) Fail closed → show list without AI blurb. |
| **Risks** | Medium — model may merge claims across sources (“Lab A said X” applied to Lab B). Mitigate with per-bullet source IDs and automated link checks. |
| **Verdict** | **Feasible later** — **best first AI feature** if any. Aligns with desk mission; adds a section without replacing primary briefs. |

### UC4 — AI-suggested headlines / expanded versions

| | |
| --- | --- |
| **What** | Alternate headlines; longer “expanded” articles from short RSS. |
| **Free-tier** | Cheap calls, but **product risk dominates**. |
| **Approach** | Headlines: only as `suggestedTitle` behind a label, primary stays source title. Expanded: **no** — expanding short RSS into long articles is fabrication by definition unless body is fetched and quoted (fetch already allow-listed; still not “expansion”). |
| **Risks** | **Very high** for expansions. Clickbait headline risk. Conflicts with “short briefs + primary link” trust model. |
| **Verdict** | Headlines: **later** (optional, labeled). Expanded articles: **No**. |

### UC5 — Other useful ideas (grounded)

| Idea | Free-tier | Verdict |
| --- | --- | --- |
| **Duplicate / near-duplicate clustering** (same story across labs) | Embeddings via Workers AI `bge-*` or string similarity in Node — cheap | **Feasible now** (start with non-AI similarity; AI embeddings later) |
| **Thin-summary detector** (already partial via `thinRelease`) | Heuristic only | **Feasible now** — no AI |
| **Weekly digest polish** (`site-digest.mjs`) with quote-only AI | 1–2 calls/week | **Later** |
| **Telegram alert when cluster ≥ N** | Tiny | **Later** |
| **RAG over archive** | Needs Vectorize/D1/R2 — may press free-tier ops; earlier free-tools notes were cautious | **Later / no** until storage story is approved |
| **Unrestricted generative “AI news desk”** | — | **No** |

---

## 4. Architecture sketch (if / when implementing — not doing now)

```
build-desk.mjs
  → existing fetch + keyword classify + composeWhat/Why
  → [optional] cluster related guids (heuristic)
  → [optional] 1× AI call: summarize cluster from provided texts only
  → write static HTML + JSON (sources listed)
  → deploy Pages / assets as today
```

- Secrets: `CLOUDFLARE_API_TOKEN` (if REST to Workers AI) or Groq/Gemini key in **GitHub Actions secrets** / Worker secrets.  
- Never ship keys to `dist-site`.  
- Feature flag env e.g. `DESK_AI=0|1` default off.  
- Tests: golden fixtures proving rejected output when model invents a URL/claim.

---

## 5. Recommended order

1. **Do nothing AI for primary briefs** — keep source-clipped `composeWhat` / factual `composeWhy`.  
2. **Non-AI wins first** — better keywords, duplicate detection, thin-summary UX (free, zero deps).  
3. **If AI at all:** **UC3 cluster summaries** (daily/per-build, sources mandatory) on **Workers AI** small model or Groq from Actions.  
4. **Then** optional closed-set **UC2** tag assist as A/B vs keywords.  
5. **Skip** UC1 rewrite and UC4 expansions.  
6. Revisit Vectorize/RAG only after Halakou approves storage + free-tier budget.

---

## 6. Bottom line

Lab Ledger is already a **zero-LLM**, allow-listed republisher with keyword tags — by design. Free AI APIs **can** run from Actions/Workers without a local PC, but the desk’s trust model forbids using them as a news writer. The only free-tier-friendly, on-mission path is **grounded clustering / rollup summaries that always cite the same RSS items the desk already filed**.



---

## 7. Update — optional Telegram rewrite (implemented, default off)

Halakou asked for a channel-only rewrite after this note recommended skipping expansions. The code is in `scripts/desk/ai-telegram.mjs` and is **not** a replacement for the filed brief.

- Live send stays on `composeMessage` unless `DESK_AI_TELEGRAM` is `1` or `true`.
- The model is instructed to return `incomplete` when a ~100-word dek cannot support 300–400 words. That status, and any grounding failure (new URL or number), falls back to the short post.
- How to dry-run and which secret **names** to add: `docs/ai-telegram.md`.
- Do not enable this in Actions or the Worker until a human has read a dry run. Push still needs Halakou's approval.
