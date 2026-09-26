# Security Policy

## Reporting a vulnerability

This project is a public register of AI-lab announcements. If you find a
security issue, please report it privately rather than opening a public issue:

- Email: **halakouac@gmail.com**
- Subject: `labledger — security report`

Please include what you found, how it could be exploited, and any proof of
concept. I will acknowledge within 48 hours and aim to publish a fix and
write-up as soon as one is ready.

Please do not report vulnerabilities through GitHub issues, the Telegram
channel, or pull request comments — those are public and permanent.

## Scope

- `github.com/halakou/labledger` — the source, the GitHub workflows, and the
  Cloudflare Worker in `cloudflare/`.
- The live sites it deploys: `labledgerdesk.pages.dev` and the
  `labledger-desk` Worker.

Out of scope: content of a brief (it points at a primary source — report
errors in the source to the source), and third-party services we do not
control.

## What is already in place

- **No credentials in the repository.** Secrets live only in GitHub Actions
  and Cloudflare. Every push is scanned by a secret scanner (`gitleaks`
  workflow) over the full commit history, and by a dependency-free guard
  (`scripts/check-repo.mjs`) that also refuses files outside the allow-listed
  layout.
- **Strict outbound allow-list.** Ingestion can only fetch from the hosts
  listed in `scripts/desk/config.mjs`. A redirect that leaves the allow-listed
  origin fails. The unit tests pin this behaviour.
- **Content Security Policy.** The static site ships a strict CSP in
  `_headers` — `default-src 'none'` with a single allow-listed inline script
  whose SHA-256 hash is generated at build time.
- **No client-side state, no forms, no auth, no cookies.** The site is static
  HTML, CSS, one inline search script, and pre-generated images.
- **Webhook and endpoint authentication.** The Telegram webhook checks a
  secret token derived from the bot token. The `/posted` endpoint requires a
  bearer token.

## Disclosure policy

Coordinated disclosure. I am happy to credit reporters in the fix write-up,
or to keep them anonymous — your call.
