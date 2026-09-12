# Smart Bookmark Cleaner — Design

**Date:** 2026-09-10
**Status:** Draft, awaiting review
**Scope:** v1 (bookmarks only). Tab management is explicitly out of scope — see
[`docs/roadmap.md`](../../roadmap.md).

---

## 1. Problem

People accumulate bookmarks and never revisit them. A typical multi-year profile
holds 500–3000 bookmarks in which:

- a meaningful share point at pages that no longer exist,
- the same URL was saved several times under different folders and titles,
- the folder tree stopped reflecting how the person actually thinks,
- finding anything is slower than just searching the web again.

Chrome's own bookmark manager offers search and manual folders, and nothing else.
It cannot tell you which links are dead, which are duplicated, or what a
bookmark is *about*.

## 2. Goals and non-goals

**Goals**

- Show the user, within seconds of opening, what is wrong with their bookmarks.
- Detect dead links accurately enough that the user trusts the result.
- Make bookmarks browsable by topic, not only by folder.
- Make every cleanup action reversible.

**Non-goals for v1**

- Tab grouping, tab suspension, session save/restore.
- Sync of our own metadata across devices.
- Firefox/Edge support (the stack keeps the door open; we do not test it in v1).
- Full-text indexing of bookmarked page content.

**Success criteria**

- A 2000-bookmark profile completes a full link scan without the user having to
  keep a tab open, and resumes correctly if the browser restarts mid-scan.
- Zero bookmarks are deleted without an explicit user action.
- Duplicate and empty-folder detection returns in under 2 seconds with no
  network permission granted.

## 3. The two hard problems

Everything else in this project is straightforward CRUD. These two are not.

### 3.1 Deciding a link is dead

The naive version — `fetch(url)` and treat non-200 as dead — produces false
positives that destroy user trust and, worse, user data:

| Situation | Naive verdict | Reality |
|---|---|---|
| Page behind a login (401/403) | dead | alive, user has an account |
| Cloudflare bot challenge (403 + challenge body) | dead | alive in a real browser |
| Rate limited (429) | dead | alive, we asked too fast |
| Server hiccup (502/503) | dead | alive, retry later |
| CMS returns 200 with a "Not found" page | **alive** | dead |
| `HEAD` unsupported (405) | dead | alive, needs `GET` |
| Site moved, 301 to a new URL | alive | alive but the bookmark is stale |

So the checker does not emit a boolean. It emits a **verdict** from a closed set,
and only two verdicts are ever eligible for a deletion suggestion. The full
verdict taxonomy, fetch strategy, and soft-404 heuristics live in
[`docs/link-check.md`](../../link-check.md).

### 3.2 Running a long job under Manifest V3

The MV3 service worker is terminated after roughly 30 seconds of inactivity.
Checking 2000 URLs at a safe rate takes minutes. The scan therefore cannot be a
loop — it is a **resumable state machine** whose cursor is persisted after every
batch. Two independent mechanisms keep it moving:

1. While the dashboard tab is open it holds a `runtime.connect` port, which keeps
   the worker alive and streams progress to the UI.
2. A `chrome.alarms` tick resumes the job when the worker was killed — tab closed,
   browser restarted, machine slept.

Because the cursor is durable, both mechanisms are merely *schedulers*. Losing
either one delays the scan; it never corrupts it.

## 4. Architecture

```
┌─────────────┐   port (progress)   ┌──────────────────────┐
│  Dashboard  │◄───────────────────►│  Background SW       │
│  (React)    │   messages (cmds)   │  ScanJob orchestrator│
└─────────────┘                     └──────────┬───────────┘
      │  reads                                 │ drives
      ▼                                        ▼
┌──────────────────────────────────────────────────────────┐
│  core/ (pure, testable, no chrome.*)                     │
│  bookmarks · linkcheck · scan · tagging · trash          │
└──────────────────────────────────────────────────────────┘
      │                                        │
      ▼                                        ▼
┌─────────────┐                     ┌──────────────────────┐
│  IndexedDB  │                     │  adapters/           │
│  records,   │                     │  chrome.bookmarks    │
│  results,   │                     │  chrome.permissions  │
│  trash      │                     │  chrome.alarms       │
└─────────────┘                     │  fetch, Gemini       │
                                    └──────────────────────┘
```

Module boundaries and message contracts: [`docs/architecture.md`](../../architecture.md).
Storage schemas: [`docs/data-model.md`](../../data-model.md).

## 5. Features

### 5.1 Instant audit (no permissions required)

On first open the dashboard reads the bookmark tree and reports, offline:

- **Duplicates** — grouped by normalized URL. Normalization strips tracking
  params (`utm_*`, `fbclid`, `gclid`, …), lowercases the host, drops a default
  port, drops a trailing slash, and drops the fragment unless it looks like a
  client-side route (starts with `#!` or `#/`) — a prefix heuristic, not an
  allowlist of known hash-routed hosts. It does **not** strip meaningful query
  params.
- **Empty folders** — folders with no descendants that hold a bookmark.
- **Suspicious entries** — `javascript:` bookmarklets, `file://`, `localhost`,
  and private-IP hosts. These are reported but **excluded from network
  scanning**.

This is the hook: value before the user grants anything.

### 5.2 Dead-link scan (optional host permission)

Triggered by an explicit button, which first calls `chrome.permissions.request`
for `<all_urls>`. If declined, the rest of the app keeps working.

- Batched, resumable, cancellable, with live progress.
- Per-host politeness: at most 2 concurrent requests to one host, spaced.
- Results are stored per bookmark with a timestamp and a run counter.
- A bookmark reaches "safe to suggest deleting" only after two independent runs
  agree on `DEAD` or `DNS_FAIL`.
- `REDIRECTED` results offer a one-click "update URL to final destination".

### 5.3 Tagging

Two layers, in this order:

1. **Offline rules** (always on): a domain→tag table plus title keyword matching.
   Instant, private, no network. Covers the common cases — code hosts, video,
   docs sites, social, shopping.
2. **Gemini** (opt-in, needs an API key): batches of ~40 `{title, url, host}`
   objects are classified against a **fixed taxonomy** using structured JSON
   output, so results stay consistent and filterable. Results are cached by URL
   hash so re-running costs nothing for already-tagged entries.

Sending titles and URLs to Google is a real privacy trade. It is opt-in, disclosed
in plain language at the point of enabling, and never the default. Details and
the taxonomy: [`docs/tagging.md`](../../tagging.md).

The dashboard can then browse by tag instead of by folder, and offers
"organize into folders by tag" as an explicit, reversible bulk action.

### 5.4 Trash and undo

- Delete always means soft-delete: the record moves to our Trash store with its
  full context (title, url, parent folder path, original index).
- Restore recreates the bookmark at its original position, recreating the parent
  folder path if it has since been removed.
- Retention 30 days, then permanent removal with a warning.
- Before any bulk operation the app writes a JSON backup of the entire bookmark
  tree, downloadable from settings.

## 6. Error handling

| Failure | Behaviour |
|---|---|
| Host permission denied | Offline features continue; scan UI explains what is missing and offers to ask again |
| Network offline mid-scan | Job pauses, does not mark anything dead, resumes on reconnect |
| Gemini key invalid / quota exceeded | Tagging falls back to offline rules, surfaces a clear message, never blocks the UI |
| Service worker killed | Alarm resumes from the persisted cursor; already-checked entries are not re-fetched |
| Bookmark changed outside the extension | Startup reconcile diffs the live tree against our index and drops stale records |
| IndexedDB quota exceeded | Oldest scan results evicted first; bookmark records and trash are never evicted |

## 7. Testing

- **Unit (Vitest), the bulk of the suite** — every module in `src/core/**`:
  URL normalization, duplicate grouping, verdict classification, soft-404
  heuristics, the scan state machine driven by a fake clock, taxonomy mapping,
  trash restore path reconstruction.
- **Adapter tests** — WXT's `fakeBrowser` for `chrome.bookmarks`, `permissions`,
  `alarms`; `fetch` mocked with a fixture table covering every verdict in
  [`docs/link-check.md`](../../link-check.md).
- **Manual QA checklist** — real profile with 1000+ bookmarks, browser restart
  mid-scan, permission denied path, invalid API key path.
- E2E (Playwright with the unpacked extension) is deferred past v1.

## 8. Risks

| Risk | Mitigation |
|---|---|
| False-positive deletions destroy user data | Two-run confirmation, no auto-delete, Trash, pre-op backup |
| `<all_urls>` slows Web Store review / scares users | Optional permission requested on demand, with an in-app explanation of why |
| Scanning many hosts fast looks like abuse | Per-host concurrency cap and spacing, honour `Retry-After` |
| Gemini cost or quota surprises | Show estimated request count before running, hard cap per run, cache by URL hash |
| Privacy backlash over sending data to Google | Opt-in only, plain-language disclosure, offline rules fully functional alone |

## 9. Open questions

None blocking. Decisions already made are recorded in [`docs/adr/`](../../adr/).
