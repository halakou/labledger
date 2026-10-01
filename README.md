# Lab Ledger Desk

A fully automated AI news desk that reads only official sources, files dated
briefs, and never invents anything. Runs entirely inside the free tiers it is
built on, with no bill so far, zero dependencies, and zero human
runtime — it keeps running if every laptop on earth disappears.

**Live site:** https://labledgerdesk.pages.dev · **Telegram:** https://t.me/labledgerdesk

---

## Why this exists

AI news is mostly screenshots, rumours, and rewrites. This desk does one thing
differently: **every brief starts at a named source** — a lab feed, a press
desk, or a GitHub release — read directly, dated, and linked on the page.
Nothing is paraphrased into a claim the source did not make, nothing is
invented, and no unnamed source ever appears.

That discipline is the product. The engineering around it is what makes it
free, verifiable, and impossible to shut down.

## How it works

```
GitHub Actions (clock)  ──every ~15 min──▶  pages.yml
                                                │
   ┌────────────────────────────────────────────┘
   ▼
node scripts/build-desk.mjs      fetch 27 allow-listed sources
   │                              → dedupe by guid → briefs → queue
   ▼
wrangler deploy                  static site → Cloudflare Pages + Worker assets
   │
   ▼
node scripts/telegram-desk.mjs   posts ONLY after the pages exist
                                  (the channel must never lead the site)

Cloudflare Worker (cron */5)     staleness watchdog
   └─ GET /desk-status.json → if older than 12 min, dispatch pages.yml
```

## Ops runbook — the clock is not the cadence

GitHub throttles free scheduled workflows to roughly **hourly** in practice, so
the `clock.yml` cron (`4,14,24,34,44,54`) is deliberately *not* what keeps the
desk fresh. The real cadence (~15 min) is carried by the Worker watchdog, which
re-dispatches `pages.yml` through the GitHub API when it sees a stale build.
The clock exists as a second, independent trigger — it costs nothing and it
means a GitHub scheduler that goes quiet does not silence the desk.

**Check freshness, do not raise the cron.** If the site looks stale, the fix is
never "make the cron denser"; it is to find out why the watchdog did not fire.
Order:

1. `curl -s https://labledgerdesk.pages.dev/desk-status.json` — is `builtAt`
   recent? That is the build clock, not the publish clock.
2. `curl -s https://labledger-desk.halakou.workers.dev/health` — read `ageMs`
   and `dispatch`. If `ageMs` is large and `dispatch` is not `dispatched`, the
   watchdog itself is stuck (Worker cron, or the GitHub API call it makes).
3. `gh run list --limit 5` — are the runs red? A failing build with a green
   watchdog still produces a stale site; the watchdog only re-dispatches, it
   cannot make a broken build succeed.

**Alert path.** Outage messages go to `TELEGRAM_ALERT_CHAT_ID` (a private chat),
never to the public channel. The address is a secret; the route is
`cloudflare/src/index.js` → the same Telegram bot, different chat. Verify the
route works by sending a test message from the Worker's own code path, not by
echoing the chat id. If the alert ever lands in `@labledgerdesk`, the wrong
secret name is in play — check `TELEGRAM_ALERT_CHAT_ID` vs `TELEGRAM_CHAT_ID`.

Two independent schedulers on two free tiers. If GitHub's scheduler goes
quiet — which it does, routinely — the Worker notices and re-dispatches. A
publish that dies on the network is retried on the next cycle, so one red run
does not leave the site stale.

## Sources

27 allow-listed origins, and no others.

- **18 feeds** in `LABS`: the labs and companies, plus five press desks —
  MIT News, MIT Review, WIRED, TechCrunch, and The Verge.
- **9 GitHub release boards** in `OPEN_PROJECTS`: PyTorch, vLLM, SGLang,
  Ollama, Transformers, ComfyUI, DeepSpeed, LangChain, and JAX. They are
  filed on `/open/`, separate from the news board.

A host that is not in that registry is never fetched.

## Cloudflare resources, and what is deliberately unused

The account carries more than this project needs, so the state of each resource
is written down rather than re-discovered. Nothing here is deleted without an
explicit decision.

- **Pages project `labledgerdesk`** → `labledgerdesk.pages.dev` — the canonical
  public origin. This is the hostname `SITE_URL` points at, so it is the one
  every canonical tag, the UA string and the watchdog depend on (C8).
- **Worker `labledgerdesk`** (assets, `cloudflare/labledgerdesk.toml`) — a mirror
  of the same `dist-site`, deployed in the same CI run. It is the origin the
  watchdog worker talks to, and it keeps serving if the Pages project is ever
  interrupted.
- **Worker `labledger-desk`** (`cloudflare/wrangler.toml`) — the watchdog, KV
  `DESK`, the Telegram bot.
- **D1 `labledger`** — removed (C9). The experimental unbound database
  (`396168a9-a3c2-469b-9ead-df86570f3b04`) was never bound to any Worker and
  is deleted. Do not recreate it unless a future feature explicitly needs D1
  and lands a binding + migration in-repo.
- **`INGEST_SECRET`** — unused worker secret, deliberately not recreated.

The shared free tier carries all of it. If a quota ever binds, the first place
it will show up is the `donate/` cost table, which says "no bill so far" rather
than "free forever" for exactly that reason (C4).

## Custom domain

C10: **stay on `labledgerdesk.pages.dev`.** Do not buy `labledger.com` or any
other paid domain for this project. The platform hostname is the canonical
`SITE_URL`. Attaching a custom domain later would still be free in Cloudflare
once a domain is owned, but purchasing one is explicitly out of scope — keep
pages.dev.

## What is in the repo

```
scripts/build-desk.mjs        ingest: fetch → dedupe → briefs → publish
scripts/desk/config.mjs       the source registry (18 feeds + 9 open projects)
scripts/desk/core.mjs         brief shape, parseFeed, classify, esc, slugify
scripts/desk/net.mjs          fetch layer — allow-list enforcement lives here
scripts/desk/render.mjs       page chrome, rows, JSON-LD, the one inline script
scripts/desk/site-home.mjs    home, board, llms.txt, _headers, desk-status.json
scripts/desk/archives.mjs     /lab/ /topic/ /kind/ /b/YYYY/M/D/slug/, sitemap
scripts/desk/sprite.mjs       one sprite.svg for every source mark + contrast tiles
scripts/desk/ogcard.mjs       per-brief 1200×630 OG image, hand-drawn
scripts/desk/learn.mjs        /learn/ field guide — original explainers
scripts/desk/donate.mjs       /donate/ cost ledger
scripts/desk/tg.mjs           shared Telegram helpers (chat, escaping, secrets)
scripts/check-repo.mjs        repo guard: layout + credential scan, runs in CI
test/                         unit tests, zero dependencies (node --test)
cloudflare/                   the watchdog Worker + static-asset config
.github/workflows/            clock, pages, ci, gitleaks, deploy-worker
```

## Invariants — breaking these breaks the project

1. **The allow-list is the security boundary.** `net.mjs` throws on any host
   outside the registry, and a redirect that leaves the origin host fails.
2. **Zero runtime dependencies.** No `package.json`, no `node_modules`. Pure
   Node built-ins — a change that needs `npm install` is a wrong change.
3. **Site before Telegram.** The channel never leads the site.
4. **No invented news.** Classification is keyword tagging, never a verdict.
5. **Free tier, forever.** If a feature needs a paid plan, it does not ship.
6. **Old URLs stay.** The archive never deletes.
7. **The posted-ledger KV mirror.** Both directions, every run — a lost Actions
   cache must never re-post every brief ever filed.

## Security

- **No credentials in the repository, ever.** Secrets live only in GitHub
  Actions and Cloudflare. Every push is scanned over its **full commit history**
  by the `gitleaks` workflow, and by a dependency-free `scripts/check-repo.mjs`
  guard that also refuses files outside the allow-listed layout — the exact
  failure mode that once leaked another project's source into this repo.
- **Strict CSP.** The site ships `default-src 'none'` with a single
  allow-listed inline script whose SHA-256 hash is generated at build time.
- **No client-side state, no forms, no auth, no cookies.** Static HTML, CSS,
  one search script, pre-generated images.
- **Every rendered field is escaped.** Pinned by tests in `test/`.
- **Every workflow action is SHA-pinned.** No `uses:` line references a moving
  tag — each is a 40-hex commit SHA with the version in a trailing comment, so
  a compromised action release cannot silently reach the pipeline. The wrangler
  tarball itself is additionally hash-verified before install in
  `deploy-worker.yml`. GitHub's repo-level *require SHA pinning* toggle is not
  available on this plan, so the property is held by the repo instead: verify
  with
  `grep -rh "uses:" .github/workflows | grep -v "@[0-9a-f]\{40\}"` — any output
  is a regression.
- See [SECURITY.md](SECURITY.md) for how to report a vulnerability.

## Testing

```bash
node --test test/*.test.mjs   # unit tests, zero dependencies
node scripts/check-repo.mjs   # layout + credential guard
node scripts/build-desk.mjs   # full local build, writes only to dist-site
```

CI (`.github/workflows/ci.yml`) runs the guard and the tests on every push
and pull request, plus a full build smoke on pull requests. `pages.yml`
runs the guard and the tests again and will not deploy if they fail.
`main` rejects a direct push. A change merges only through a pull request
after `verify` and `gitleaks` are green.

## Run it yourself

```bash
git clone https://github.com/halakou/labledger.git
cd labledger
node scripts/build-desk.mjs     # writes dist-site/ + .desk-*.json locally
```

That is the whole install. No dependencies to install, no config to fill in,
and it cannot touch the live site — only CI deploys.

## Tech stack

Node 22 built-ins · GitHub Actions · Cloudflare Pages · Cloudflare Workers ·
Workers KV · static HTML/CSS/SVG · fonts vendored in `assets/fonts/` (no
Google Fonts fetch). Nothing else, nothing paid.

## License

MIT — see [LICENSE](LICENSE). The briefs point at primary sources; the code is
yours to read, run, and reuse.

---

*Every brief here starts at an official source. Nothing is rewritten from a
rumor.*
