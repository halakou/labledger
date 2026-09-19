# Lab Ledger

Public register of official AI-lab announcements. The live board is the published app. This repo keeps the desk awake.

## What is already created

- Cloudflare D1 database `labledger`
- Cloudflare KV `labledger-desk`
- Worker source at `cloudflare/` (name: `labledger-desk`)
- Hourly GitHub Action at `.github/workflows/desk.yml`

## You paste these once

### 1. Telegram (optional, for the channel)

1. Open Telegram, talk to [BotFather](https://t.me/BotFather), create a bot, copy the token.
2. Add the bot as admin of your channel.
3. In the published app settings, add:
   - `TELEGRAM_BOT_TOKEN` = that token
   - `TELEGRAM_CHAT_ID` = `@yourchannel` (example: `@labledger`)

### 2. Desk secret + live URL (required for hourly ping)

1. Make a long random string. That is `INGEST_SECRET`.
2. In the published app settings, add `INGEST_SECRET` = that string.
3. GitHub → this repo → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**:
   - `INGEST_SECRET` = the same string
   - `DESK_URL` = the live https URL of the published board (no trailing slash)

### 3. Cloudflare Worker (keeps the desk alive even if GitHub sleeps)

1. Cloudflare dashboard → **My Profile** → **API Tokens** → token with Workers edit.
2. GitHub → this repo → **Settings** → **Secrets** → **Actions**:
   - `CLOUDFLARE_API_TOKEN` = that token
3. Cloudflare Worker `labledger-desk` → **Settings** → **Variables**:
   - `DESK_URL` = the same live https URL
   - `INGEST_SECRET` = the same string
4. GitHub → **Actions** → **deploy-worker** → **Run workflow**.

Do not put tokens in the repo. Do not scrape labs without a feed.
