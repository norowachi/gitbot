# Gitbot v2 — Release Announcement

> **Copy the sections below into `/announce create` as needed, or post them directly in your server.**

---

## 🚀 Gitbot v2 is here

After a full ground-up rewrite, Gitbot v2 is live. Here's everything that's new.

---

### 🔐 Security

Your GitHub tokens are now **encrypted at rest** with AES-256-CBC before being stored. A database dump no longer exposes anyone's credentials. If you're upgrading from v1, re-run `/link` to rotate your token into the new encrypted format.

Ed25519 interaction signature verification now uses Node's built-in Web Crypto API — the `discord-interactions` npm dependency has been removed entirely.

---

### ✏️ Issues — 4 new subcommands

| Command | What it does |
|---|---|
| `/issues reopen` | Reopen a closed issue |
| `/issues comment` | Add a comment without leaving Discord |
| `/issues list` | Browse open/closed/all issues with paginated embeds |
| `/issues update` | Deep-link to the GitHub edit page |

`/issues create` now supports **labels** (multi-select with autocomplete), **assignees**, **milestones**, and per-repo **auto-project** (GitHub ProjectV2) integration via `/settings issues`.

---

### 🔀 Pull Requests — 5 new subcommands

| Command | What it does |
|---|---|
| `/pulls merge` | Merge with a confirmation prompt, method picker, and commit message |
| `/pulls reopen` | Reopen a closed PR |
| `/pulls list` | Paginated PR browser |
| `/pulls comment` | Add a review comment |
| `/pulls request_review` | Request a reviewer |

`/pulls create` now supports draft PRs, maintainer-can-modify, head forks, and issue-to-PR conversion.

---

### 📁 Repositories

`/repos get` now shows language, stars, forks, open issues, watchers, default branch, topics, license, and timestamps — all in one embed.

`/repos list` supports filtering by visibility (public/private/all) and shows the last-updated timestamp for each repo.

---

### 👤 My profile

`/my notifications` — view your unread GitHub notifications inline, with links to the relevant items.

---

### ⚙️ Settings

`/settings view` — see all your current preferences in one embed.

`/settings issues` now supports `auto_project` (a GitHub ProjectV2 node ID) so issues created in that repo are automatically added to your project board.

---

### 🔗 Linking

`/link` now supports **token rotation** — run it again while already linked to swap your PAT without losing any settings. Your token is entered via a Discord Modal so it's never visible in chat.

`/unlink` now shows a confirmation prompt before deleting your data.

---

### 🧩 Activity Streak *(new module)*

Track how many consecutive days you perform GitHub actions through Gitbot.

- `/streak` — your current streak with flame-level indicators (🌱 → 🔥 → ⚡ → 💎)
- `/streak top` — server leaderboard

Actions that count: creating issues, closing/reopening issues, merging PRs.

---

### 👁️ Repo Watchdog *(new module)*

Get notified in a Discord channel when new issues or PRs are opened — without configuring GitHub webhooks on the repo side.

- `/watch add` — configure a repo + Discord webhook URL
- `/watch remove` / `/watch list` / `/watch status` / `/watch log`

Three delivery modes:
- **Poll** — check on a schedule (works for any readable repo)
- **Webhook** — real-time GitHub → bot delivery (requires `admin:repo_hook` token scope)
- **Hybrid** — webhook as primary + polling as catchup

---

### ⚡ Buttons & Modals survive restarts

All confirmation buttons (merge, unlink) and paginated embeds are now backed by Redis. Clicking a button after the bot restarts works correctly — no more silent failures.

---

### 🏗️ Under the hood

- **Kernel architecture** — hot-restart via `kill -HUP` or `POST /admin/restart`; module hotplug via file watcher
- **MongoDB** replaces LevelDB for persistent data; LevelDB replaced by **Redis** for the autocomplete cache
- **pino** structured logging — JSON in production, pretty-printed in development
- **esbuild** bundler replaces `tsc-alias` — faster builds, single output files
- **Vitest** unit tests for crypto, option parsing, autocomplete, and error formatting
- **GitHub Actions CI** — type-check, lint, test, build on every PR

---

## Upgrading from v1

1. Run `pnpm install` to pull the new dependencies (Redis is now required)
2. Copy `example.env` and fill in `DISCORD_PUBLIC_KEY`, `REDIS_URL`, and `ENCRYPTION_KEY`
3. Start Redis (or use the included `docker-compose.yml`)
4. Run `pnpm register` to update your slash commands in Discord
5. Start the bot: `pnpm start`
6. Ask your users to run `/link` again to rotate their tokens into encrypted storage

---

## Coming next (P1 roadmap)

- `/issues search` — full-text GitHub issue search from Discord
- `/pulls diff` — file change summary embed
- `/releases list` + `create`
- GitHub ProjectV2 deeper integration
- Interactive `StringSelectMenu` repo picker

---

*Gitbot is open source. Contributions welcome.*
