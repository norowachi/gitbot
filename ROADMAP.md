# Gitbot v2 — What Changed & What's Next

---

## What was rewritten and why

### 1. Token security: plain text → AES-256-CBC

**Before:** GitHub Personal Access Tokens were stored in the database as plain text.
A DB dump would expose every user's token.

**After:** Tokens are encrypted at rest with AES-256-CBC using a 32-byte key from
`ENCRYPTION_KEY` in `.env`. The stored value is `iv_hex:ciphertext_hex`. Decryption happens
only at request time, in memory. The key never touches the database.

---

### 2. Signature verification: imported library → native Web Crypto

**Before:** The original used `discord-interactions` npm package.

**After:** Ed25519 verification is done entirely with Node's built-in `node:crypto` /
`globalThis.crypto.subtle` — zero extra dependency, same security.

---

### 3. Issues command: 3 subcommands → 7 subcommands

| Subcommand | v1 | v2 |
|---|---|---|
| `create` | ✅ | ✅ + auto_assignees, milestone, labels with multi-select autocomplete, auto-project (ProjectV2) |
| `get` | ✅ | ✅ improved embed |
| `close` | ✅ | ✅ + close reason (`completed` / `not_planned`) |
| `reopen` | ❌ | ✅ |
| `comment` | ❌ | ✅ |
| `list` | ❌ | ✅ paginated embed + simple mode |
| `update` | ❌ | ✅ (deep-links to GitHub edit page) |

---

### 4. Pulls command: 3 subcommands → 8 subcommands

| Subcommand | v1 | v2 |
|---|---|---|
| `create` | ✅ | ✅ + draft, maintainer_can_modify, head_repo, issue-to-PR |
| `get` | ✅ | ✅ richer embed (diffs, reviewers, merge status) |
| `close` | ✅ | ✅ |
| `merge` | ❌ | ✅ with confirmation button, merge method choice, commit title/message |
| `reopen` | ❌ | ✅ |
| `list` | ❌ | ✅ paginated |
| `comment` | ❌ | ✅ |
| `request_review` | ❌ | ✅ |
| `update` | ❌ | ✅ (deep-links to GitHub) |

---

### 5. Autocomplete: per-field coverage

| Field | v1 | v2 |
|---|---|---|
| `owner` | ✅ | ✅ Fuse.js fuzzy search |
| `repo` | ✅ | ✅ fuzzy |
| `pull_number` | ✅ | ✅ cache-backed |
| `issue_number` | ✅ | ✅ cache-backed |
| `labels` | ❌ | ✅ multi-label (comma-separated, already-selected labels preserved) |
| `head` / `base` branches | ❌ | ✅ live branch list |
| `reviewer` | ❌ | ✅ |

---

### 6. Embed builders extracted and shared

Before, each command built its own embed ad-hoc with no consistency.
Now `CreateIssueEmbed()` and `CreatePREmbed()` are shared functions in
`src/utils/functions/main.ts`, used by both `get` and `list` commands.

---

### 7. Pagination

`embedMaker()` implements paginated embeds using `prev/next` buttons with:
- Per-user authorship guard (only the invoker can page through)
- Automatic button disable at first/last page
- 15-minute timeout that disables buttons and patches the original message via REST

---

### 8. Merge with confirmation

`/pulls merge` shows the PR title and chosen merge strategy, then waits for a
✅ Merge / ❌ Cancel button click before touching GitHub. Unmergeable or already-merged
PRs are rejected early with a clear error message.

---

### 9. Settings command expanded

| Setting | v1 | v2 |
|---|---|---|
| `ephemeral` | ✅ | ✅ |
| `simple` | ✅ | ✅ |
| `issues auto_assignees` | ✅ | ✅ per-repo, clearable |
| `issues auto_project` | ❌ | ✅ GitHub ProjectV2 node_id |
| `view` | ❌ | ✅ shows all current settings in one embed |

---

### 10. New `/my` subcommands

| Subcommand | v1 | v2 |
|---|---|---|
| `profile` | basic | rich embed + lookup any GitHub user |
| `notifications` | ❌ | ✅ lists unread notifications |

---

### 11. New `/repos` command

| Subcommand | v1 | v2 |
|---|---|---|
| `list` | basic | paginated, sortable by visibility |
| `get` | basic | full embed: stars, forks, license, topics, branch, timestamps |

---

### 12. Docker: multi-stage + healthcheck

The Dockerfile uses a 3-stage build (`deps` → `builder` → `runner`) to keep the final
image small. `docker-compose.yml` adds a MongoDB healthcheck so the app container waits
for the DB before starting.

---

## Roadmap — Recommended next steps

### P1 — Features users will notice

- [ ] **`/issues search`** — full-text search across a repository's issues using the
  GitHub Search API (`q=repo:owner/repo is:issue label:bug`).
- [ ] **`/pulls diff`** — post a summary of changed files + line counts as an embed,
  fetched from `GET /repos/{owner}/{repo}/pulls/{pull_number}/files`.
- [ ] **`/issues assign` / `unassign`** — standalone subcommands for managing assignees
  without reopening the full issue edit.
- [ ] **Webhook support** — a `/webhook` Express route that accepts GitHub webhook events
  (push, issue opened, PR merged) and forwards them as Discord messages to a configured
  channel per repo. Store `channel_id` + `webhook_url` per-repo in settings.
- [ ] **`/releases list` / `create`** — manage GitHub Releases from Discord.

---

### P2 — Scalability

- [ ] **Queue-backed cache refresh** — instead of fire-and-forget `upsertLevelUser()` on
  every command invocation, use a BullMQ queue with a Redis backend. Stale cache triggers
  a background job; the request uses whatever is cached.
- [ ] **MongoDB read replica** — point `getUser()` lookups at a secondary replica to reduce
  primary load when user count grows.

---

### P3 — Quality of life

- [ ] **`/help` command** — lists all commands with short descriptions and links to the
  documentation site.
- [ ] **Interactive repo selector** — use a `StringSelectMenu` component for `owner` +
  `repo` pickers instead of free-text autocomplete where the autocomplete list is short
  enough (≤ 25 items).
- [ ] **`/pulls review`** — submit a review (APPROVE / REQUEST_CHANGES / COMMENT) via
  a modal so reviewers don't need to open GitHub.
- [ ] **Milestone management** — `/milestones list`, `create`, `close` subcommands.
- [ ] **Label management** — `/labels list`, `create`, `delete` so teams can manage labels
  without leaving Discord.

---

## What was added: Kernel, Hotplug & Modules

### Kernel (`src/kernel/`)

The bot now has a proper kernel layer that owns the HTTP server, module lifecycle,
file watching, and signal handling.  `src/index.ts` is a 10-line boot shim.

**Hot-restart** — `kill -HUP <pid>` or `POST /admin/restart`:
drains in-flight requests (5 s grace), tears down all modules, reloads everything
from disk, and rebinds the server on the same port.  No process exit.
Redis-backed component handlers survive because they're not in-process state.

**Hotplug** — drop a compiled module file into `dist/modules/` and the kernel's
file watcher detects it and loads it automatically (debounced 400 ms).
Editing an existing module file triggers a hot-reload of that module only.

**Admin HTTP API** (`/admin/*`, protected by `X-Admin-Token` header):

| Method | Path | Description |
|--------|------|-------------|
| GET    | `/admin/modules` | List loaded modules |
| POST   | `/admin/modules/:id/reload` | Reload a single module |
| POST   | `/admin/modules/load` | Load a new module by file path |
| DELETE | `/admin/modules/:id` | Unload a module |
| POST   | `/admin/commands/sync` | Push command set to Discord |
| POST   | `/admin/restart` | Trigger hot-restart |

### Module system (`src/modules/`)

Every feature is a `Module` object:

```ts
export default {
  id: "my-feature",         // unique, stable
  name: "My Feature",
  version: "1.0.0",
  commands: [...],          // slash commands
  router: { path, handler },// optional Express sub-router
  setup(kernel) { ... },    // start timers, subscribe to events
  teardown(ctx, kernel) {}, // clean up on unload
} satisfies Module;
```

### Module: Activity Streak (`src/modules/streak/`)

Tracks how many consecutive days a user performs GitHub write actions through
Gitbot.  Stores data in MongoDB (`Streak` collection).  Commands: `/streak view`,
`/streak top` (server leaderboard).  Listens for the `github:action` kernel event
emitted by write commands (create issue, close issue, merge PR, etc.).

### Module: Repo Watchdog (`src/modules/watchdog/`)

Polls configured GitHub repositories on a per-watch interval and posts new
issues/PRs to a Discord webhook URL.  Stores watch configs in MongoDB
(`WatchedRepo` collection).  Commands: `/watch add`, `/watch remove`, `/watch list`.
The background poller runs inside the module's `setup()` context and is stopped
cleanly in `teardown()`, so hot-reloads don't leak timers.
