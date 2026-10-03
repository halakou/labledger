# Telegram bot capabilities for Lab Ledger news posts

**Date:** 2026-10-04 (Asia/Tehran)  
**Sources:** [Bot API — Formatting options](https://core.telegram.org/bots/api#formatting-options), sendMessage / sendPhoto / InlineKeyboardMarkup / Sticker docs.  
**Scope:** Research for the AI Telegram rewrite system prompt. Read-only inventory — do not invent unsupported syntax in prompts or model output.

**Lab Ledger today:** `scripts/telegram-desk.mjs` posts with `parse_mode: "HTML"`, short dek + OG `sendPhoto` (caption) or `sendMessage`, plus `InlineKeyboardMarkup` url buttons. Prefer keeping **HTML** for the AI pipeline unless the whole send path is rewritten and tested for MarkdownV2 escaping.

---

## 1. Hard limits (must teach the model)

| Limit | Value | Note for news posts |
| --- | --- | --- |
| Text message (`sendMessage`) | **4096** characters after entities parsing | ~300–400 English words is usually safe; still count UTF-16 / HTML tags carefully |
| Media caption (`sendPhoto` / video / document / animation / audio / voice) | **1024** characters after entities | **Do not** put a 300-word rewrite in a photo caption — use `sendMessage` (or photo without long caption + separate text) |
| Inline button text | 1–64 characters | Keep labels short (“Read the brief”, “Official source”) |
| Callback data | 1–64 bytes | Lab Ledger uses **url** buttons only (no callback) — safest for channels |
| URL button url | HTTP(S) | Must be valid https |
| Photo file | ≤10 MB; width+height ≤10000; ratio ≤20 | Desk uses local OG PNG |
| Document | ≤50 MB (cloud Bot API) | Rarely needed for news |
| Video | ≤50 MB | Rarely needed |
| Stickers | `sendSticker` — **no caption**, no parse_mode on the sticker itself | Separate text message if needed |
| Messages per second | Soft rate limits; flood wait | Desk already sleeps ~350 ms between posts |

UTF-8 encoding required. Entity offsets are in **UTF-16 code units** (relevant if building entities manually; HTML/Markdown modes hide this if tags are valid).

---

## 2. Parse modes — what the AI must not confuse

Pass exactly one of: `HTML`, `MarkdownV2`, or legacy `Markdown` (discouraged). Or pass `entities` / `caption_entities` and omit parse_mode.

### 2.1 HTML (recommended for Lab Ledger / AI output)

Supported tags (nesting allowed; must be properly closed):

| Tag | Effect |
| --- | --- |
| `<b>…</b>` or `<strong>` | Bold |
| `<i>…</i>` or `<em>` | Italic |
| `<u>…</u>` or `<ins>` | Underline |
| `<s>…</s>`, `<strike>`, `<del>` | Strikethrough |
| `<span class="tg-spoiler">…</span>` or `<tg-spoiler>` | Spoiler |
| `<a href="https://…">…</a>` | Inline link (http/https/`tg://` user links) |
| `<code>…</code>` | Inline code |
| `<pre>…</pre>` or `<pre><code class="language-…">` | Pre / code block |
| `<blockquote>…</blockquote>` | Block quote |
| `<blockquote expandable>…</blockquote>` | Expandable block quote |

**Escape in HTML mode:** any raw `<`, `>`, `&` in user/source text must become `&lt;` `&gt;` `&amp;` (also `"` → `&quot;` if used in attributes). Lab Ledger already has `escHtml()` in `scripts/desk/tg.mjs`.

**AI prompt rule:** Emit **only** these HTML tags. Do **not** emit Markdown `*bold*`, `**bold**`, `` `code` ``, or `# headings` — Telegram HTML is not GitHub Markdown.

### 2.2 MarkdownV2 (powerful, easy for models to break)

Syntax examples:

- `*bold*`
- `_italic_`
- `__underline__`
- `~strikethrough~`
- `||spoiler||`
- `[label](https://example.com)`
- `` `inline code` ``
- ` ``` ` / ` ```lang ` pre blocks
- `>` blockquote line prefix (and expandable forms per current docs)

**Must escape** these characters anywhere they are literal (with `\`):  
`_ * [ ] ( ) ~ ` > # + - = | { } . !`

Any unescaped reserved character → **entire send fails** (`can't parse entities`). Models routinely forget to escape `.` `!` `-` `(` in headlines and URLs.

**AI prompt rule:** Prefer **not** asking the model for MarkdownV2. If used, post-process with a strict escaper; never trust raw model text.

### 2.3 Legacy Markdown

Older `*bold*`, `_italic_`, `` `code` ``, `[text](url)`. Incomplete vs HTML/MarkdownV2; **do not use** for new Lab Ledger work.

### 2.4 Common model mistakes to ban in the system prompt

1. Using `**double asterisk**` or `# Heading` (not Telegram).  
2. Mixing HTML and Markdown in one message.  
3. Unescaped `& < >` inside HTML.  
4. Unescaped `. ! -` in MarkdownV2.  
5. Putting formatting inside URLs / button urls.  
6. Assuming GitHub/Discord/Slack markdown works.  
7. Emitting HTML comments or `<div>` / `<p>` / `<br>` — **`<br>` is not documented**; use real newlines.  
8. Custom emoji shortcodes like `:rocket:` — clients show plain text unless you use custom_emoji entities (needs Premium / custom emoji ids). Prefer normal Unicode emoji characters.

---

## 3. Emoji

- Unicode emoji in message text/caption are fine (count toward length).  
- **Custom emoji** (`custom_emoji` entity / `<tg-emoji emoji-id="…">`) need a valid `custom_emoji_id`; bots can use custom emoji in some contexts when the bot owner has Premium — **fragile for automation**. Prefer standard Unicode.  
- Desk product rule (Halakou): **max two** emoji, only for genuinely big news, topic-matched (e.g. 🚀 / 🔥 for major model launches). Zero emoji is the default.  
- Do not spam emoji in every line; do not replace words with emoji rebuses.

---

## 4. Stickers

| Method | Use for news? |
| --- | --- |
| `sendSticker` | Optional reaction sticker **after** or **instead of** text — **no caption**. Needs `file_id` or uploaded .WEBP/.TGS/.WEBM |
| Sticker sets | Created via Bot API / @BotFather; not needed per post |
| Custom emoji stickers | Same fragility as custom emoji entities |

**Verdict for automated news:** **Risky / skip** unless you maintain a fixed allow-listed `file_id` map. Stickers add no facts and complicate idempotent posting. Prefer emoji in text + HTML.

---

## 5. Inline keyboards (`InlineKeyboardMarkup`)

Safe for channel news when buttons are **url** only:

```json
{
  "inline_keyboard": [
    [
      { "text": "Read the brief", "url": "https://labledgerdesk.pages.dev/b/…" },
      { "text": "Official source", "url": "https://…" }
    ]
  ]
}
```

| Button type | Safe for automated channel news? |
| --- | --- |
| `url` | **Yes** — primary CTA |
| `callback_data` | Needs webhook handler; useless on channels for subscribers |
| `web_app` | Private chats / Mini Apps — not for channel posts |
| `login_url` | Special OAuth flow — no |
| `switch_inline_query*` | No for channel news |
| `pay` / game | No |
| `copy_text` | Optional nicety; not required |
| `disabled` (newer) | Rarely needed |

**Limits:** Reasonable row/button counts; keep **1 row × 1–2 url buttons** like today. Button text ≤64 chars.

`ReplyKeyboardMarkup` (custom reply keyboards) is for private/group chats with the bot — **not** for channel posts. Do not ask the AI to invent reply keyboards.

---

## 6. Media methods relevant to news

| Method | Caption? | Safe for desk? |
| --- | --- | --- |
| `sendMessage` | n/a (full 4096 text) | **Yes — best for long AI rewrite** |
| `sendPhoto` | ≤1024 | **Yes** for OG card **if caption stays short**; else photo then text, or text only |
| `sendDocument` | ≤1024 | Optional PDF/attachment — usually no |
| `sendVideo` / `sendAnimation` | ≤1024 | Only if you have real assets |
| `sendMediaGroup` | captions per item rules | Albums — overkill for one brief |
| `sendVoice` / `sendAudio` / `sendVideoNote` | voice/audio yes | Not for text news |
| `sendPaidMedia` | Stars paywall | Conflicts with free desk mission — **no** |
| `copyMessage` / `forwardMessage` | — | Ops only |
| `sendRichMessage` / drafts (Bot API 10.x) | Rich blocks + streaming | Powerful for AI UX; **newer**; adopt only after Worker/Actions support is tested. Not required for v1 rewrite |

`link_preview_options` on `sendMessage`: desk already sets large preview for the brief URL. AI should not invent extra URLs that fight the preview.

---

## 7. Channel / group specifics

- Bot must be **channel admin** with `can_post_messages` (desk already diagnoses this).  
- Posts appear as channel posts (`channel_post`), not private `message`.  
- No reply keyboard on channels.  
- Inline url buttons work on channels.  
- `protect_content` can block forwarding/saving — usually **off** for a public ledger.  
- `message_effect_id` (message effects) — cosmetic; optional, not fact-bearing.  
- Discussion group auto-forwards are separate; do not depend on them for the primary post.

---

## 8. Safe vs risky for automated Lab Ledger posts

### Safe (use in AI prompt + pipeline)

- `parse_mode: HTML` with `<b>`, `<i>`, `<blockquote>`, `<a href>`, `<code>`  
- Plain Unicode emoji (0–2)  
- Structure: **title → short summary → bullets → filing line**  
- `sendMessage` for long bodies; short caption or no caption on OG photo  
- `InlineKeyboardMarkup` with 1–2 **url** buttons (brief + official source)  
- Escaping all dynamic text through `escHtml`  
- Falling back to today’s short HTML post if AI status is `incomplete` / parse error

### Risky (ban or gate behind explicit product decision)

- MarkdownV2 from the model without a post-escape pass  
- Stickers / custom emoji ids  
- Callback buttons  
- Captions >1024 for 300-word rewrites  
- Invented hashtags as “formatting”  
- `sendRichMessage` until the desk’s Node sender implements and tests it  
- Paid media, polls, checklists, gifts, stories as “news packaging”  
- Mixing site brief rewrite into Telegram while inventing facts (product invariant — separate from Bot API)

---

## 9. Snippet for the AI system prompt (copy-adapted)

```
You format Telegram channel posts for Lab Ledger Desk.

OUTPUT FORMAT RULES (Telegram Bot API):
- Use Telegram HTML only: <b> <i> <u> <s> <code> <pre> <a href="https://..."> <blockquote> <tg-spoiler>.
- Do NOT use Markdown, MarkdownV2, **double asterisks**, # headings, or <br>/<div>/<p>.
- Use real newlines between sections.
- Escape is done by the server pipeline; do not emit raw < > & inside plain text runs.
- Max length: keep the final HTML body under ~3500 characters so it fits sendMessage (4096 limit).
- Never rely on a photo caption for the long body (caption max 1024).
- Emoji: at most two Unicode emoji total; only for major launches; otherwise none.
- Do not request stickers, custom emoji ids, polls, or reply keyboards.
- Links that matter go in separate structured fields / buttons; inline <a> only for real https URLs from the source brief.
- Structure: bold headline, blank line, 1–2 sentence summary, blank line, short bullets for key facts present in the source, blank line, italic filing note.
```

---

## 10. Bottom line for Lab Ledger AI rewrite

Teach the model **HTML-only Telegram formatting**, **4096 / 1024 length split**, **url inline buttons**, and **emoji restraint**. Do **not** teach MarkdownV2 or stickers for v1. Keep generating **structured JSON** (headline, tags, text, status, flags, emoji) and let `telegram-desk.mjs` / `escHtml` assemble the final Bot API payload so the model never invents unsupported syntax that fails the send.
