# CLAUDE.md

Project instructions for Claude Code. Read this before touching any file.

## What this is

**Smart Bookmark Cleaner** — a Manifest V3 Chrome extension that scans a user's
bookmarks and helps them clean up: duplicates, empty folders, dead links, and
automatic tagging (offline rules + optional Gemini).

Full design: [`docs/superpowers/specs/2026-09-10-bookmark-cleaner-design.md`](docs/superpowers/specs/2026-09-10-bookmark-cleaner-design.md)

## Golden rules — never break these

1. **Never auto-delete a bookmark.** The scanner *suggests*; only an explicit
   user action removes anything. Link-check false positives are unavoidable
   (login walls, rate limits, bot blocks), so deletion is always user-driven.
2. **Every destructive action goes through Trash.** Soft-delete with the full
   record (title, url, parent path, index) so restore puts it back where it was.
   Auto-export a JSON backup before any bulk operation.
3. **A "dead" verdict is a suggestion, not a fact.** Only `DEAD` (404/410) and
   `DNS_FAIL` are ever offered for deletion, and only after two confirmations on
   separate scan runs. Never offer 401/403/429/5xx/timeout.
4. **The API key is a secret.** `chrome.storage.local` only — never `sync`,
   never logged, never in a commit, never sent anywhere except Google's endpoint.
5. **Core logic stays pure.** Modules under `src/core/**` must not call `chrome.*`
   directly. Browser access lives in thin adapters so core logic is unit-testable.

## Stack

| Concern | Choice |
|---|---|
| Extension framework | WXT (auto manifest, real HMR, cross-browser) |
| UI | React 19 + TypeScript (strict) |
| Styling | Tailwind CSS v4 |
| Bulk storage | IndexedDB via `idb` |
| Settings | `chrome.storage.sync` (small values only) |
| Secrets | `chrome.storage.local` |
| Tests | Vitest + WXT `fakeBrowser` |
| LLM | Gemini (`gemini-flash-latest`), structured JSON output |

## Commands

```bash
pnpm dev         # dev server + HMR, loads unpacked extension
pnpm build       # production build -> .output/chrome-mv3
pnpm zip         # packaged zip for Chrome Web Store
pnpm test        # vitest
pnpm typecheck   # tsc --noEmit
pnpm lint        # eslint
```

## Layout

```
src/
  entrypoints/
    background.ts     # MV3 service worker: job orchestration only
    popup/            # quick summary + "open dashboard"
    options/          # settings, API key, rules
    dashboard/        # main workspace (full tab page)
  core/               # PURE logic, no chrome.* calls, fully unit-tested
    bookmarks/        # tree read, normalize, duplicates, empty folders
    linkcheck/        # fetch strategy, verdict classification, queue
    scan/             # resumable job state machine
    tagging/          # offline rules + Gemini provider + taxonomy
    trash/            # soft delete, restore, export
  adapters/           # thin chrome.* wrappers (the only place chrome.* appears)
  services/           # composition: adapters + core, no logic of its own
  ui/                 # React components and hooks
  shared/             # types, typed message bus, constants
```

## Workflow

The main branch of this repository is **`master`** (not `main`). Branch from
it and open pull requests against it.

**Commit each part as soon as it is done.** Do not batch unrelated changes into
one commit. A "part" = one module, one feature slice, or one docs update that
stands on its own and passes `pnpm typecheck && pnpm test`.

Commit message format — **English, imperative, short**:

```
<type>: <what changed>
```

- Subject under ~60 chars, no trailing period, no long body unless truly needed.
- Types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `perf`.
- Good: `feat: add url normalizer`, `fix: fall back to GET on 405`,
  `test: cover soft-404 detection`
- Bad: `feat: implemented the new URL normalization utility function which
  handles trailing slashes, tracking params and more`

Every commit ends with the trailer:

```
Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

## MV3 gotchas that will bite you

- The service worker is killed after ~30s idle. **Never hold scan state in
  module scope** — persist the job cursor to IndexedDB after every batch.
- A long scan survives via two mechanisms together: a long-lived `runtime.connect`
  port from the dashboard keeps the worker alive while the user watches, and
  `chrome.alarms` resumes the job if the worker dies or the tab closes.
- `chrome.storage.local` has a ~10MB quota. Bulk records belong in IndexedDB.
- Host permissions for link checking are **optional** and requested on demand
  (`chrome.permissions.request`) — the extension must stay fully functional for
  offline features when they are denied.
- WXT derives an entrypoint's name from the filename segment before its first
  dot, so a colocated `background.test.ts` collides with `background.ts` and
  breaks the build. The `entrypoints:found` hook in `wxt.config.ts` filters
  test files out of the scan so `foo.ts` -> `foo.test.ts` colocation works.

## Conventions

- TypeScript `strict`, no `any`. Prefer discriminated unions over booleans for
  state (e.g. `LinkVerdict`, `JobStatus`).
- Tests colocated: `foo.ts` -> `foo.test.ts`.
- Write the test before the implementation for anything in `src/core/**`.
- Never log URLs, titles, or the API key in production builds.
