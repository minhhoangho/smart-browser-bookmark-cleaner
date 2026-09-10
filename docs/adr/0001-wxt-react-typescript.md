# ADR 0001 — WXT + React + TypeScript

**Status:** accepted · **Date:** 2026-09-10

## Context

A Manifest V3 extension with several surfaces (popup, options, a full dashboard
page, a background worker) and non-trivial UI: a filterable list of thousands of
bookmarks.

## Decision

Build with WXT, React 19, TypeScript in strict mode, and Tailwind CSS v4.

## Why

- WXT generates the manifest from entrypoint files and gives real HMR across all
  surfaces, including the background worker — the main pain of MV3 development.
- Cross-browser output is free, which keeps a Firefox port open without costing
  anything now.
- Recursive bookmark-tree handling and a ten-member verdict union are exactly
  where a type checker earns its keep.
- React for a virtualized, filterable list of thousands of rows; hand-rolling
  that in vanilla is a lot of work for no benefit.

## Alternatives

- **Vite + CRXJS** — popular and well documented, but the manifest is hand-written
  and its MV3 HMR has been less reliable.
- **Vanilla TS** — smallest bundle, but the dashboard is the whole product and
  building it by hand is slow.

## Consequences

A build step and a framework dependency. Bundle size is not a meaningful
constraint for an extension whose UI opens on demand.
