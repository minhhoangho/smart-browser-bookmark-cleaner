# Data model

## Where each thing lives, and why

| Store | Holds | Why there |
|---|---|---|
| IndexedDB (`sbc` database) | bookmark records, scan results, tags, trash, jobs | Bulk data with queries; `chrome.storage.local` caps around 10 MB and cannot index |
| `chrome.storage.sync` | user settings | Small, follows the user across devices, 100 KB / 8 KB-per-item quota |
| `chrome.storage.local` | Gemini API key | Must **not** propagate across devices; never synced, never logged |

## IndexedDB object stores

```ts
// store: 'bookmarks', keyPath 'id'   (id = chrome bookmark id)
interface BookmarkRecord {
  id: string
  parentId: string
  path: string[]          // folder names, root first
  index: number
  title: string
  url: string
  normalizedUrl: string   // index — duplicate detection
  dateAdded: number
  scannable: boolean      // false for javascript:, file:, localhost, private IPs
}

// store: 'results', keyPath 'bookmarkId'
interface ScanResult {
  bookmarkId: string
  verdict: LinkVerdict    // index — filter the dashboard by verdict
  httpStatus: number | null
  finalUrl: string | null // set when REDIRECTED
  checkedAt: number
  runCount: number        // consecutive runs agreeing on this verdict
  detail: string | null   // e.g. which soft-404 heuristic fired
}

// store: 'tags', keyPath 'bookmarkId'
interface TagRecord {
  bookmarkId: string
  tags: string[]          // multiEntry index — browse by tag
  source: 'rules' | 'llm' | 'user'
  taggedAt: number
}

// store: 'trash', keyPath 'trashId'
interface TrashEntry {
  trashId: string
  title: string
  url: string
  parentPath: string[]    // names, not ids — ids may no longer exist
  index: number
  deletedAt: number       // index — 30-day retention sweep
  reason: 'duplicate' | 'dead-link' | 'manual'
}

// store: 'jobs', keyPath 'jobId'
interface ScanJob {
  jobId: string
  status: 'idle' | 'running' | 'paused' | 'done' | 'cancelled'
  config: ScanConfig
  cursor: number          // index into the ordered candidate list
  total: number
  checkedCount: number
  startedAt: number
  updatedAt: number
}

// store: 'llmCache', keyPath 'urlHash'
interface LlmCacheEntry {
  urlHash: string         // sha-256 of normalizedUrl
  tags: string[]
  model: string
  cachedAt: number
}
```

## Verdict type

```ts
type LinkVerdict =
  | 'ALIVE'
  | 'REDIRECTED'
  | 'DEAD'            // 404, 410 — eligible for a deletion suggestion
  | 'DNS_FAIL'        // host does not resolve — eligible
  | 'SOFT_404'        // 200 but the page says not found — review, never auto
  | 'AUTH_REQUIRED'   // 401, 403 without a bot-challenge signature
  | 'BLOCKED'         // bot challenge detected
  | 'RATE_LIMITED'    // 429
  | 'SERVER_ERROR'    // 5xx
  | 'TIMEOUT'
  | 'UNKNOWN'
```

Only `DEAD` and `DNS_FAIL` may ever appear in a deletion suggestion, and only
once `runCount >= 2`.

## Settings

```ts
interface Settings {
  scan: {
    batchSize: number          // default 20
    globalConcurrency: number  // default 6
    perHostConcurrency: number // default 2
    timeoutMs: number          // default 8000
  }
  tagging: {
    llmEnabled: boolean        // default false — opt-in
    model: string              // default 'gemini-flash-latest'
    maxRequestsPerRun: number  // default 50 — hard cost cap
  }
  safety: {
    backupBeforeBulkOps: boolean // default true
    trashRetentionDays: number   // default 30
  }
}
```

## Eviction

IndexedDB is not unlimited. If a quota error occurs, evict in this order:

1. `llmCache` entries older than 90 days
2. `results` for bookmarks with verdict `ALIVE`, oldest first

`bookmarks` and `trash` are **never** evicted.
