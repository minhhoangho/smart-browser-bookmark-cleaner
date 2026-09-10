# ADR 0006 — Never auto-delete; two-run confirmation before suggesting

**Status:** accepted · **Date:** 2026-09-10

## Context

Link checking produces false positives that no amount of engineering removes:
login walls, bot challenges, rate limits, transient server errors, sites that
block datacentre or unfamiliar clients. An automatic cleanup built on those
verdicts would silently destroy bookmarks the user still wants.

## Decision

1. The extension never deletes a bookmark on its own, under any setting.
2. Only `DEAD` (404/410) and `DNS_FAIL` are ever offered for deletion, and only
   after two runs at least an hour apart agree on the verdict.
3. Every deletion is a soft delete into Trash with the context needed to restore
   it to its original folder and position; retention is 30 days.
4. A full JSON backup is written before any bulk operation.

## Why

- The cost of a false positive (permanent data loss) is far higher than the cost
  of a false negative (a dead bookmark survives).
- "Automatic cleanup" is the feature a user would want right up until it removes
  something they cared about — after which they uninstall and warn others.
- Two runs an hour apart cheaply eliminates the largest false-positive source: a
  network outage or a temporary block making everything look dead at once.

## Consequences

The product is a *reviewing* tool, not a one-click cleaner, and the UI has to
make reviewing fast enough that this is not a burden. No "auto-clean" setting
will be added later; requests for one are answered with this ADR.
