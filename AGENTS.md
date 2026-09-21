# Lab Ledger Desk — agent context

Read this before touching anything. It is the whole project in one file, so no
agent has to re-derive it by exploring. Verify anything against the live site
rather than trusting this blindly — the site moves every ten minutes, this file
does not.

## What it is

A fully automated AI news desk. Zero cost, zero dependencies, zero human
runtime. It reads official announcements from 28 allow-listed sources, builds a
static site, posts the same briefs to Telegram, and keeps going if every laptop
on earth disappears. Nothing is invented. Every brief points at a primary source.

- Site: https://labledgerdesk.pages.dev
- Channel: https://t.me/labledgerdesk
- Repo: github.com/halakou/labledger (branch `main`, 77+ commits)
- Worker watchdog: https://labledger-desk.halakou.workers.dev/health

## The pipeline

```
clock.yml (GitHub cron, every 10 min at :04:14:24:34:44:54)
  └─ completes ─> pages.yml (workflow_run trigger)
       ├─ node scripts/build-desk.mjs     ← fetch 28 sources, build dist-site
       ├─ wrangler deploy labledgerdesk.toml   ← site as Worker static assets
       ├─ wrangler pages deploy dist-site      ← site on Cloudflare Pages
       ├─ node scripts/telegram-desk.mjs       ← posts ONLY after pages exist
       └─ node scripts/post-donate-announce.mjs (one-shot, idempotent)

Worker "labledger-desk" (cron */5)
  └─ GET /desk-status.json  ─> if older than 12 min, dispatch pages.yml via GitHub API
```

Two Cloudflare targets, deliberately:
- `cloudflare/labledgerdesk.toml` — the site as Worker static assets (mirror).
- `cloudflare/wrangler.toml` — the watchdog worker: staleness check, KV store,
  Telegram bot commands. KV binding `DESK` holds `last` and `posted`.

If GitHub's scheduler goes quiet, the worker notices and re-dispatches. That is
the independence guarantee.

## Repo map

```
scripts/build-desk.mjs     ingest: fetch -> dedupe by guid -> briefs -> queue -> publish
scripts/desk/config.mjs    SOURCE REGISTRY (28), KINDS, TOPICS, caps, OUT paths
scripts/desk/core.mjs      brief shape, parseFeed, classify, esc, slugify, date
scripts/desk/net.mjs       fetch layer — allow-list enforcement lives here
scripts/desk/render.mjs    shell() page chrome, rowHtml, markHtml, JSON-LD
scripts/desk/site-home.mjs home, /open/ board, llms.txt, _headers, desk-status.json
scripts/desk/archives.mjs  /lab/ /topic/ /kind/ /b/YYYY/M/D/slug/ sitemap, rss.xml
scripts/desk/open-archives.mjs  /open/ pages + /open/rss.xml
scripts/desk/sprite.mjs    ONE sprite.svg for all 28 marks + contrast tiles
scripts/desk/ogcard.mjs    per-brief 1200x630 OG image, hand-drawn
scripts/desk/learn.mjs     /learn/ field guide — original explainers
scripts/desk/donate.mjs    /donate/ — cost ledger + TON/USDT rails
scripts/desk/site-digest.mjs  /method/ + weekly /week/ digest
scripts/desk/house.css     all styling, dark mode via prefers-color-scheme
scripts/desk/glyphs.mjs    fallback glyph per source (when no real logo)
scripts/desk/raster.mjs    PNG/ICO decode for mark normalization
scripts/desk/fetch-mark.mjs  fetch + normalize one source logo
scripts/telegram-desk.mjs  queue -> channel, posted-ledger KV mirror
scripts/post-donate-announce.mjs  one channel announcement
scripts/cleanup-channel-posts.mjs  delete dupes (manual, workflow_dispatch)
cloudflare/src/index.js    watchdog + /posted KV + Telegram bot commands
.github/workflows/         clock, pages, deploy-worker, cleanup-channel, desk(retired)
```

## State files (GitHub Actions cached, key `desk-state-<run_id>`)

- `.desk-posted.json` — guid -> Telegram message URL. Losing this re-posts
  everything, so it is mirrored to worker KV `/posted` on every run and
  recovered from there on a cache miss. Never weaken this mirror.
- `.desk-queue.json` — what telegram-desk.mjs is due to send.
- `.desk-archive.json` — every brief ever filed + `nextId`. Capped at 500.
- `.desk-open.json` — open-project releases.
- `.desk-assets/` — fonts + fetched logos.

## Invariants — breaking these breaks the project

1. **Allow-list is the security boundary.** `net.mjs fetchHttps` throws on any
   host outside `lab.hosts`, and a redirect that leaves the origin host fails.
   A new source needs `hosts` (and usually `iconHosts` for its CDN).
2. **Zero runtime dependencies.** No `package.json`, no `node_modules`. Pure
   Node 22 built-ins. A change that needs `npm install` is a wrong change.
3. **Site before Telegram.** `telegram-desk.mjs` runs after pages deploy. The
   channel must never lead the site.
4. **No invented news.** Briefs come only from allow-listed official feeds or
   the Anthropic `/news` listing. Classification is keyword tagging, never a
   verdict. Never paraphrase a source into a claim it did not make.
5. **Free tier, forever.** GitHub Actions free, Cloudflare Pages/Workers/KV
   free tiers. If a feature needs a paid plan, it does not ship.
6. **Old URLs stay.** The archive never deletes, only slices to 500.
7. **One inline script only.** The search filter inside `render.mjs shell()`.
   The site is static; keep it that way.
8. **The posted-ledger KV mirror.** Both directions, every run.
9. **Contrast tiles are baked into the sprite `<symbol>`.** A logo's luminance
   picks its tile color at build time, so it stays legible in dark mode without
   a second file or a CSS branch. Do not move this out of the symbol.

## How to change things

### Add source #29
Add an entry to `LABS` (or `OPEN_PROJECTS` for a GitHub-releases project) in
`config.mjs`: `id, label, mark, color, feed, hosts, iconHosts`. If the logo will
not fetch, add a real fallback glyph in `glyphs.mjs` — the default is a star and
it will look like OpenAI's. `sprite.mjs` and the contrast tile handle the rest.
Dry-run a fetch of the feed first; some hosts 301 to a CDN.

### Add a page type
Copy the `learn.mjs` pattern: a module exporting one `write*()` function, wired
into `pages.mjs publishSite()`, then four manual joins — nav + footer in
`render.mjs shell()`, sitemap in `archives.mjs`, llms.txt in `site-home.mjs`.
Forgetting the joins is the usual bug: the page exists but is unreachable.

### Change the domain
`SITE_URL` is an env var, so: the three `env:` blocks in `pages.yml`, the
worker's `wrangler.toml` `[vars]` and its `SITE`/`CHANNEL` constants in
`cloudflare/src/index.js`, and the `config.mjs` default. Canonical, OG, sitemap
and RSS all derive from it.

## Testing protocol (mandatory)

Nothing touches `main` untested. Clone to `/tmp/<name>test`, run
`node scripts/build-desk.mjs` there (it writes to its own `dist-site` and
`.desk-*` files — it cannot touch the live site; only CI deploys). Then:
`node --check` every file you touched, validate any XML with
`python3 -c "import xml.etree.ElementTree as ET; ET.parse(...)"`, and for markup
changes grep the built output for the new string. Commit only when local output
matches expectations. CI runs the real build on push.

## Known failure modes (each has bitten once)

- **Favicon redirects to a CDN** (The Verge -> cdn.vox-cdn.com) ->
  `fetchText` throws "redirect off allowlist" -> add the CDN to `iconHosts`.
- **Fallback glyph collision** -> a source with no real logo gets the star,
  identical to OpenAI -> give it a real glyph in `glyphs.mjs`.
- **Dark mode hides dark logos** -> fixed by the contrast tile; if you see a
  logo disappear, the luminance estimate in `sprite.mjs` misfired.
- **A writer put output in `dist-site`** -> it is wiped at the start of every
  build; state belongs in `.desk-*.json`.
- **Marks not copied to OUT** -> they are not; one sprite holds them all.
- **Secret name drift** (`GITHUB_DISPATCH_TOKEN` vs `DISPATCH_TOKEN`) -> the
  worker silently stops being able to dispatch. Keep names exact.
- **HTML in the Telegram template** -> `escHtml` everything user-derived.

## Health check (do this first, every session)

```bash
curl -s https://labledgerdesk.pages.dev/desk-status.json   # builtAt fresh?
curl -s https://labledger-desk.halakou.workers.dev/health   # ageMs, dispatch
gh run list --limit 5                                       # CI green?
```

If `ageMs` is large and `dispatch` is not `dispatched`, the pipeline is stuck.

## Secrets (names only — values live in GitHub + Cloudflare, never in code)

`CLOUDFLARE_API_TOKEN`, `DISPATCH_TOKEN`, `TELEGRAM_BOT_TOKEN`,
`TELEGRAM_CHAT_ID`, `TELEGRAM_CHANNEL_URL`, `TELEGRAM_WEBHOOK_URL`.
Worker secrets are pushed by `deploy-worker.yml` on any `cloudflare/**` change.

## Known small debts

- `donate.mjs` COSTS says "News intake (17 labs)" — the real count is 18 LABS
  + 10 OPEN_PROJECTS = 28 sources. Fix the label when you are in that file.
- `pages.pack.b64` is unreferenced dead weight; safe to delete.
- Meta and xAI are absent by design: no official feed the desk will fetch.
