# Smart Bookmark Cleaner

A Chrome extension (Manifest V3) that helps you clean up years of accumulated
bookmarks: find duplicates and empty folders, detect dead links without
false-positive deletions, and browse by topic instead of by folder.

> **Status:** design phase. No implementation code yet — see
> [`docs/roadmap.md`](docs/roadmap.md).

## What it does

- **Instant audit** — duplicates, empty folders, and unscannable entries, offline,
  with no permission requested.
- **Dead-link scan** — batched and resumable, with a verdict taxonomy that tells a
  404 apart from a login wall, a rate limit, or a bot challenge.
- **Tagging** — offline domain and keyword rules, optionally enriched by Gemini
  against a fixed taxonomy.
- **Safe by construction** — nothing is ever deleted automatically; every removal
  goes to a restorable Trash, and bulk operations write a backup first.

## Documentation

Start with the [design spec](docs/superpowers/specs/2026-09-10-bookmark-cleaner-design.md),
then [`docs/`](docs/README.md) for the deep dives and decision records.
[`CLAUDE.md`](CLAUDE.md) holds the working conventions.

## Stack

WXT · React 19 · TypeScript · Tailwind CSS v4 · IndexedDB · Vitest
