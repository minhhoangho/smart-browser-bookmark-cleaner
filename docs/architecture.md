# Architecture

## Layering rule

```
entrypoints/  →  ui/  →  core/  ←  adapters/
```

- `core/**` is **pure**: no `chrome.*`, no `fetch`, no `Date.now()` reached for
  directly. Anything from the outside world arrives as a function argument or an
  injected port. This is what makes the tricky logic testable.
- `adapters/**` is the **only** place browser APIs and network calls appear. Each
  adapter is a thin, boring wrapper — no business logic.
- `entrypoints/**` wires the two together.

If you find yourself importing `wxt/browser` inside `core/`, the boundary is
wrong — pass the capability in instead.

## Modules

### `core/bookmarks`

| File | Responsibility |
|---|---|
| `flatten.ts` | Turn the nested `BookmarkTreeNode` tree into a flat `BookmarkRecord[]` carrying the folder path |
| `normalize-url.ts` | Canonical form of a URL for duplicate detection and cache keys |
| `duplicates.ts` | Group records by normalized URL, pick a "keeper" (oldest, or the one in the shallowest folder) |
| `empty-folders.ts` | Find folders with no bookmark descendants |
| `classify-entry.ts` | Mark unscannable entries: `javascript:`, `file:`, `chrome:`, localhost, private IPs |

### `core/linkcheck`

| File | Responsibility |
|---|---|
| `strategy.ts` | Decide the request plan for a URL: `HEAD` first, `GET` with a byte range when needed |
| `classify.ts` | Map `{status, headers, finalUrl, bodyHead, error}` → `LinkVerdict` |
| `soft404.ts` | Heuristics for a 200 response that is really a not-found page |
| `queue.ts` | Concurrency-limited, per-host-throttled work queue over a batch |

`classify.ts` is a pure function over a plain object. That is deliberate: it is
the single most correctness-sensitive piece of the project and it must be
exhaustively unit-testable without touching the network.

### `core/scan`

`job.ts` implements a state machine, not a loop:

```
idle → running → paused → running → done
             ↘ cancelled
```

The job holds `{ jobId, config, cursor, total, checkedCount, startedAt, status }`.
`step(job, deps) → { job, results }` processes exactly one batch and returns the
next job state. The caller persists it. Nothing lives in memory between steps, so
a killed service worker costs at most one batch of progress.

### `core/tagging`

| File | Responsibility |
|---|---|
| `taxonomy.ts` | The fixed tag vocabulary (see `docs/tagging.md`) |
| `rules.ts` | Domain table + title keyword matching → tags, offline |
| `llm/prompt.ts` | Build the batch classification request |
| `llm/schema.ts` | The response schema handed to Gemini for structured output |
| `tagger.ts` | Compose: rules first, LLM to enrich, cache by URL hash |

### `core/trash`

Soft-delete records carry enough context to undo: `title`, `url`, `parentPath`
(as an array of folder names, not ids — ids may be gone), and `index`. Restore
recreates missing folders along the path before inserting.

### `adapters/`

`bookmarks.ts` · `permissions.ts` · `alarms.ts` · `storage.ts` · `db.ts` ·
`http.ts` · `gemini.ts`

## Message contract

The dashboard talks to the background worker over a typed bus in
`shared/messaging.ts`. Commands are request/response; progress is a stream over a
long-lived port.

```ts
type Command =
  | { type: 'scan/start'; config: ScanConfig }
  | { type: 'scan/pause' }
  | { type: 'scan/resume' }
  | { type: 'scan/cancel' }
  | { type: 'scan/status' }
  | { type: 'tag/run'; scope: 'all' | 'untagged' }

type ProgressEvent =
  | { type: 'scan/progress'; checked: number; total: number; verdict: LinkVerdict }
  | { type: 'scan/finished'; summary: ScanSummary }
  | { type: 'scan/error'; message: string }
```

The port serves a second purpose: an open port keeps the MV3 service worker
alive while the user is watching the scan.

## Startup reconcile

Bookmarks change outside the extension. On every worker startup and on
`chrome.bookmarks` change events, the app diffs the live tree against the stored
index:

- **added** → new record, untagged, unchecked
- **removed** → drop the record and its scan results (keep trash entries)
- **moved / renamed** → update the record, keep scan results
- **url changed** → update the record, **discard** scan results and tags

Reconcile runs before any scan starts, so a job never operates on stale ids.
