# ADR 0004 — IndexedDB for bulk data, chrome.storage for settings

**Status:** accepted · **Date:** 2026-09-10

## Context

A large profile means thousands of bookmark records plus scan results, tags, and
trash entries. The dashboard filters by verdict and by tag.

## Decision

IndexedDB (via `idb`) for bookmarks, results, tags, trash, jobs, and the LLM
cache. `chrome.storage.sync` for settings only. `chrome.storage.local` for the
API key.

## Why

- `chrome.storage.local` caps around 10 MB without the `unlimitedStorage`
  permission, and adding that permission works against ADR 0002's goal of a light
  permission footprint.
- `chrome.storage` has no indexes; filtering thousands of records by verdict or
  tag would mean loading everything into memory on every query.
- `chrome.storage.sync` is the right home for settings precisely because it
  follows the user — and the wrong home for an API key for the same reason.

## Consequences

An async, versioned schema with migrations to maintain. Quota is finite, so
`docs/data-model.md` defines an eviction order in which bookmark records and
trash are never evicted.
