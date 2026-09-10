# Roadmap

Each numbered item is a **commit checkpoint**: it stands on its own, passes
`pnpm typecheck && pnpm test`, and gets committed before the next one starts.
Commit messages are English, imperative, short — see `CLAUDE.md`.

## Phase 0 — Foundation

1. Scaffold WXT + React + TypeScript + Tailwind — `chore: scaffold wxt project`
2. Vitest setup with `fakeBrowser` — `chore: set up vitest`
3. Shared types and typed message bus — `feat: add shared types and message bus`
4. IndexedDB schema and adapter — `feat: add indexeddb adapter`

## Phase 1 — Instant audit (no permissions)

5. Bookmark tree flatten + records — `feat: flatten bookmark tree into records`
6. URL normalization — `feat: add url normalizer`
7. Duplicate grouping + keeper selection — `feat: detect duplicate bookmarks`
8. Empty folder + unscannable entry detection — `feat: detect empty folders`
9. Startup reconcile against the live tree — `feat: reconcile index on startup`
10. Dashboard shell + audit view — `feat: add dashboard audit view`

**Milestone:** open the extension, immediately see duplicates and empty folders,
nothing requested from the user.

## Phase 2 — Trash and safety

11. Trash store, soft delete, restore — `feat: add trash with restore`
12. JSON backup export — `feat: export bookmark backup`
13. Bulk actions with confirm + auto-backup — `feat: add guarded bulk actions`

**Milestone:** every destructive path is reversible. This lands *before* the
scanner so no verdict can ever cause an unrecoverable deletion.

## Phase 3 — Dead-link scan

14. Optional host permission flow — `feat: request host permission on demand`
15. Verdict classifier (pure) — `feat: classify link check verdicts`
16. Soft-404 heuristics — `feat: detect soft 404 pages`
17. Request strategy: HEAD, GET fallback, ranged body — `feat: add fetch strategy`
18. Per-host throttled queue — `feat: add throttled request queue`
19. Resumable scan job state machine — `feat: add resumable scan job`
20. Background orchestration: port keepalive + alarms — `feat: orchestrate scan in background`
21. Scan UI: progress, pause, cancel, results — `feat: add scan progress ui`
22. Two-run confirmation before deletion is offered — `feat: require two runs before suggesting deletion`

**Milestone:** a 2000-bookmark scan survives a browser restart and suggests
nothing it should not.

## Phase 4 — Tagging

23. Taxonomy + offline rules — `feat: add offline tagging rules`
24. Settings page with key input and disclosure — `feat: add settings page`
25. Gemini adapter with structured output — `feat: add gemini tagging provider`
26. Tagger composition, cache, cost cap — `feat: compose rule and llm tagging`
27. Browse-by-tag view — `feat: browse bookmarks by tag`
28. Organize into folders by tag — `feat: organize bookmarks by tag`

**Milestone:** bookmarks are browsable by topic; tagging works with or without
a key.

## Phase 5 — Release

29. Popup summary — `feat: add popup summary`
30. Onboarding and empty states — `feat: add onboarding`
31. Icons, store listing copy, privacy policy — `docs: add store listing assets`
32. Manual QA pass on a real profile — `chore: qa pass`

## Out of scope for v1 — the tab manager

Deliberately deferred. It is a separate product with a separate spec: different
APIs (`chrome.tabs`, `chrome.tabGroups`), a different usage pattern, and a
different competitor (Chrome's own Tab Groups and Memory Saver already cover the
easy part, so it needs a real differentiator — smart auto-grouping or session
save/close — to be worth building).

Shared ground worth reusing later: URL normalization, the tagging engine, and
"save all tabs as bookmarks" as the bridge between the two halves.
