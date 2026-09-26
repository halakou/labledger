# Lab Ledger Desk

A fully automated AI news desk that reads only official sources, files dated
briefs, and never invents anything. Zero cost, zero dependencies, zero human
runtime — it keeps running if every laptop on earth disappears.

**Live site:** https://labledgerdesk.pages.dev · **Telegram:** https://t.me/labledgerdesk

---

## Why this exists

AI news is mostly screenshots, rumours, and rewrites. This desk does one thing
differently: **every brief starts at a primary source** — an official feed or
release page from a named lab — read directly, dated, and linked on the page.
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
node scripts/build-desk.mjs      fetch 27 allow-listed official sources
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

Two independent schedulers on two free tiers. If GitHub's scheduler goes
quiet — which it does, routinely — the Worker notices and re-dispatches. That
is the independence guarantee, and it is the reason the desk has never gone
stale.

## What is in the repo

```
scripts/build-desk.mjs        ingest: fetch → dedupe → briefs → publish
scripts/desk/config.mjs       the source registry (27) — the security boundary
scripts/desk/core.mjs         brief shape, parseFeed, classify, esc, slugify
scripts/desk/net.mjs          fetch layer — allow-list enforcement lives here
scripts/desk/render.mjs       page chrome, rows, JSON-LD, the one inline script
scripts/desk/site-home.mjs    home, board, llms.txt, _headers, desk-status.json
scripts/desk/archives.mjs     /lab/ /topic/ /kind/ /b/YYYY/M/D/slug/, sitemap
scripts/desk/sprite.mjs       one sprite.svg for all 27 marks + contrast tiles
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
- See [SECURITY.md](SECURITY.md) for how to report a vulnerability.

## Testing

```bash
node --test test/        # 35 unit tests, zero dependencies
node scripts/check-repo.mjs   # layout + credential guard
node scripts/build-desk.mjs   # full local build, writes only to dist-site
```

CI (`.github/workflows/ci.yml`) runs the guard, the tests, and — on pull
requests — a full build smoke. Nothing reaches `main` untested.

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
Workers KV · static HTML/CSS/SVG. Nothing else, nothing paid.

## License

MIT — see [LICENSE](LICENSE). The briefs point at primary sources; the code is
yours to read, run, and reuse.

---

*Every brief here starts at an official source. Nothing is rewritten from a
rumor.*
