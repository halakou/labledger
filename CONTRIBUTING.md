# Contributing to Lab Ledger Desk

This desk is a public register of official AI-lab announcements. The code is
small, has zero dependencies, and runs on free tiers forever. Contributions
are welcome — especially corrections.

## The two rules that govern everything

1. **Nothing is invented.** A brief only ever repeats what an official source
   said. Classification is keyword tagging, never a verdict. Never paraphrase
   a source into a claim it did not make.
2. **Free tier, forever.** GitHub Actions and Cloudflare free tiers only. If a
   change needs a paid plan or an `npm install`, it is the wrong change — the
   project runs on pure Node built-ins and no dependencies.

## Before you change anything

Read [AGENTS.md](AGENTS.md) — it is the whole project in one file. Then:

```bash
git clone https://github.com/halakou/labledger.git
cd labledger
node --test test/                 # 35 unit tests, zero dependencies
node scripts/check-repo.mjs       # layout + credential guard
node scripts/build-desk.mjs       # full local build → dist-site/
```

The local build writes only to `dist-site/` and `.desk-*.json` in your clone.
**It cannot touch the live site** — only CI deploys.

## What good changes look like

- **A correction to a brief** — tell us which lab, which brief, what is wrong.
- **A new source** — add an entry to `LABS` (or `OPEN_PROJECTS`) in
  `scripts/desk/config.mjs` with its `hosts`. Dry-run the feed first; some
  hosts 301 to a CDN and need an `iconHosts` entry. See AGENTS.md.
- **A test** — the pure functions in `scripts/desk/core.mjs` are the easiest
  high-value additions.
- **A fix to an explainer** in `scripts/desk/learn.mjs`.

## The guard is deliberate

`scripts/check-repo.mjs` refuses files outside the allow-listed top-level
paths and anything that looks like a credential. It exists because this repo
once leaked another project's source through temporary commits that were
deleted from `main` but not from history. If your change needs a new
top-level directory, add it to the allow-list in that script and explain why
in your pull request.

**Never commit a file from another project.** Delete-from-`main` is not
delete-from-history.

## Pull requests

- One concern per PR.
- `node --test test/` and `node scripts/check-repo.mjs` must pass — CI runs
  both, plus a full build smoke on PRs.
- Reference the brief or source you are correcting.

## Reporting a security issue

Do **not** open an issue. See [SECURITY.md](SECURITY.md) — report privately.
