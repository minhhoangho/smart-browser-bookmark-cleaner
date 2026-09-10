# ADR 0002 — Host permissions are optional and requested on demand

**Status:** accepted · **Date:** 2026-09-10

## Context

Checking whether a bookmark is dead requires cross-origin `fetch`, which needs
`<all_urls>` host permission. Declared up front, Chrome shows "Read your data on
all websites" at install time — the scariest warning in the store — and Web Store
review scrutinises it heavily.

## Decision

Install with `bookmarks` and `storage` only. Request `<all_urls>` through
`chrome.permissions.request` when the user first starts a link scan.
`https://generativelanguage.googleapis.com/*` is requested separately when the
user enables Gemini tagging.

## Why

- The whole Phase 1 feature set — duplicates, empty folders, offline tagging —
  works with no host permission at all, so the extension is useful before it asks
  for anything.
- Asking at the moment of use, next to a button the user just pressed, converts
  far better than asking at install.
- Two narrow, separately-granted permissions are easier to explain and to review
  than one broad one.

## Consequences

Every network-dependent code path must handle "permission not granted" as a
normal state, not an error. The UI needs a clear explanation and a re-ask path
for users who decline.
