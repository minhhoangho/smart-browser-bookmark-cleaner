# Documentation index

| Document | Read it when |
|---|---|
| [Design spec](superpowers/specs/2026-09-10-bookmark-cleaner-design.md) | You want the whole picture: problem, scope, features, risks |
| [Architecture](architecture.md) | You are adding a module and need to know where it goes |
| [Data model](data-model.md) | You are touching storage, schemas, or quotas |
| [Link checking](link-check.md) | You are changing anything under `core/linkcheck/**` — read first |
| [Tagging](tagging.md) | You are working on rules, the taxonomy, or the Gemini integration |
| [Roadmap](roadmap.md) | You are picking up the next piece of work |
| [Phase 0–1 plan](superpowers/plans/2026-09-10-phase-0-1-foundation-and-audit.md) | You are implementing the foundation and audit |
| [Phase 2 plan](superpowers/plans/2026-09-12-phase-2-trash-and-safety.md) | You are implementing Trash, backup and bulk actions |

## Decision records

| ADR | Decision |
|---|---|
| [0001](adr/0001-wxt-react-typescript.md) | WXT + React + TypeScript |
| [0002](adr/0002-optional-host-permissions.md) | Host permissions are optional, requested on demand |
| [0003](adr/0003-resumable-scan-job.md) | The scan is a persisted state machine, not a loop |
| [0004](adr/0004-indexeddb-for-bulk-storage.md) | IndexedDB for bulk data, chrome.storage for settings |
| [0005](adr/0005-gemini-opt-in-fixed-taxonomy.md) | Gemini tagging is opt-in, fixed taxonomy |
| [0006](adr/0006-never-auto-delete.md) | Never auto-delete; two-run confirmation |
