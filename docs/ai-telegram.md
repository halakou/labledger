# Optional AI Telegram rewrite

Default **off**. The live channel keeps today's short `composeMessage` until `DESK_AI_TELEGRAM` is set. This path never posts during a dry run.

"Atria Dan Preview" means the text model id **`Atria-Dawn-Preview`**. No vision.

## Enable (do not do this in production yet)

Set `DESK_AI_TELEGRAM` to `1` or `true` in the GitHub Actions environment that runs `scripts/telegram-desk.mjs`.

Provider order, first match wins:

1. `ATRIA_API_KEY` → `POST https://api.atria-asi.ai/v1/chat/completions`, model `Atria-Dawn-Preview`
2. `DESK_AI_WORKER_URL` + `DISPATCH_TOKEN` → `POST {url}/ai/rewrite` on the desk Worker (same Bearer token as `/posted`)
3. `GROQ_API_KEY` (optional `GROQ_MODEL`, default `llama-3.1-8b-instant`)
4. `GEMINI_API_KEY` (optional `GEMINI_MODEL`, default `gemini-2.0-flash`)

Optional: `DESK_AI_TARGET_WORDS` (default 350, clamped 80–600). `DESK_AI_DRY_RUN=1` on `telegram-desk.mjs` composes messages and exits before any Telegram call and before the posted-ledger write.

The Worker route uses the same secret order, and `env.AI` only if a Workers AI binding exists. `cloudflare/wrangler.toml` does **not** declare that binding. Free-plan neurons (10,000/day) apply only if it is added later. Do not uncomment it just to try this.

If the model returns `incomplete` or `error`, or grounding rejects the text, the sender logs the reason and posts the existing short brief.

## Dry run (never posts)

From the repo root, one real queue item:

```bash
node scripts/ai-telegram-dry-run.mjs --guid="https://techcrunch.com/?p=3172830"
```

No API key still runs. It prints the current short post, `no-provider`, then an offline fixture (clearly labeled, not that RSS item). `--mock` forces the offline path even if a key is present. `--fixture=path.json` loads `{ "post", "raw" }` or a bare post.

## Invariant conflict

AGENTS invariant 4: never paraphrase a source into a claim it did not make. A ~100-word RSS dek usually cannot honestly become 300–400 words. The prompt tells the model to return `status: "incomplete"` instead of guessing, and the live path then keeps the short post. Treat a long `ok` as suspicious until a human has read a dry run. Do not turn the flag on until secrets exist only in Actions / Worker, and Halakou has approved a push.

## Secrets to add (names only)

Actions (the `telegram-desk` job): one of `ATRIA_API_KEY`, or `GROQ_API_KEY`, or `GEMINI_API_KEY`, plus `DESK_AI_TELEGRAM` when you mean to publish. Worker, only if using `/ai/rewrite`: `ATRIA_API_KEY` or `GROQ_API_KEY` or `GEMINI_API_KEY`. `DISPATCH_TOKEN` is already the auth for that route.
