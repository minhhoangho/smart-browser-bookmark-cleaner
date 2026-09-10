# ADR 0005 — Gemini tagging is opt-in and constrained to a fixed taxonomy

**Status:** accepted · **Date:** 2026-09-10

## Context

Domain rules classify roughly the common cases and nothing else — they cannot
tell that a personal blog post is about distributed systems. An LLM can, but it
costs money, needs a key, requires network access, and means sending the user's
bookmark titles and URLs to a third party.

## Decision

Two layers. Offline rules always run. Gemini (`gemini-flash-latest`, structured
JSON output) runs only after the user supplies a key and accepts an explicit
disclosure, and classifies against a closed 20-tag taxonomy rather than
generating free-form tags.

## Why

- Opt-in keeps the extension fully functional, and fully private, for anyone who
  does not want it — which must be the default, not a fallback.
- A fixed taxonomy keeps tags consistent enough to filter by. Free-form tagging
  over 2000 bookmarks produces hundreds of near-duplicate labels and is useless
  as a navigation aid.
- Structured output with a response schema removes prose parsing, the usual
  source of flaky LLM integrations.
- Caching by URL hash means a second run over an unchanged library costs nothing.

## Consequences

Two tagging code paths to keep in sync, and a disclosure obligation: the privacy
trade must be stated in plain language at the point of enabling, not buried.
Adding a tag to the taxonomy is a deliberate change to code and prompt.
