# ADR 0003 — The scan is a persisted state machine, not a loop

**Status:** accepted · **Date:** 2026-09-10

## Context

The MV3 service worker is terminated after roughly 30 seconds of inactivity.
Politely checking 2000 URLs takes minutes. Any in-memory loop is guaranteed to
be killed partway through.

## Decision

Model the scan as `step(job, deps) → { job, results }`: one batch per call, with
the resulting job state persisted to IndexedDB immediately. Two schedulers drive
it — a long-lived `runtime.connect` port from the dashboard (which also keeps the
worker alive while the user watches) and a `chrome.alarms` tick that resumes the
job when the worker was killed.

## Why

- Durability comes from the persisted cursor, not from keeping the worker alive.
  The schedulers are then merely optimisations: losing one delays the scan, it
  never corrupts it.
- `step` is a pure function over plain data, so the whole scan lifecycle —
  including resume-after-death — is unit-testable with a fake clock and no
  browser.
- Running the scan in the dashboard page instead would dodge the worker lifetime
  entirely but would stop the moment the user closes the tab.

## Consequences

Nothing about a running scan may live in module scope. Worst-case loss on a
worker kill is one batch, which is re-run on resume — so checks must be safe to
repeat.
