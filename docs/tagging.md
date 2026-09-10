# Tagging

Chrome bookmarks store only `title`, `url`, and `dateAdded`. There is no tag
field and no page content. Everything below is metadata we derive and store
ourselves.

## Two layers

### Layer 1 — offline rules (always on)

Runs instantly, needs no permission, sends nothing anywhere. Two inputs:

- **Domain table** — `github.com` → `dev`, `youtube.com` → `video`,
  `arxiv.org` → `research`, `figma.com` → `design`, and so on. Also matches by
  suffix so `docs.python.org` and `python.org` both resolve.
- **Title keywords** — a small weighted keyword list per tag, matched against the
  bookmark title.

Covers the common cases and is the sole tagger when the user has no API key,
is offline, or has declined LLM tagging.

### Layer 2 — Gemini (opt-in)

Enabled only after the user supplies an API key and accepts the disclosure.
Classifies against the **fixed taxonomy** below — never free-form, so the tag
list stays small enough to browse and filter.

- Model: `gemini-flash-latest` (cheap, fast, free tier is generous for this use).
- Batch of ~40 items per request: `{ id, title, host, path }`. The path is
  included because `/blog/2019/rust-async-explained` carries real signal.
- Structured output: `responseMimeType: 'application/json'` plus a
  `responseSchema`, so we never parse prose.
- Host permission needed: `https://generativelanguage.googleapis.com/*` only —
  narrow and unrelated to the `<all_urls>` used for link checking.

## Taxonomy

A closed set. Adding a tag is a deliberate change to `core/tagging/taxonomy.ts`
and to the prompt, not something the model may invent.

```
dev            ai-ml          design         productivity
finance        news           learning       docs
video          social         shopping       travel
health         career         entertainment  tools
research       blog           reference      other
```

Each bookmark gets one to three tags. `other` is allowed and expected — forcing
a confident tag onto an ambiguous bookmark is worse than admitting ignorance.

## Composition

```
rules(record) → baseTags
  ├─ llm disabled / no key / offline  → baseTags
  └─ llm enabled                      → merge(baseTags, llmTags), deduped, max 3
```

A tag the user set by hand (`source: 'user'`) always wins and is never
overwritten by a later run.

## Cost control

- Cache keyed by `sha256(normalizedUrl)` — re-running tagging over an unchanged
  library costs zero requests.
- `maxRequestsPerRun` (default 50 ≈ 2000 bookmarks) is a hard stop.
- Before a run the UI shows the estimated request count and how many entries are
  already cached.
- Quota or auth failure degrades to Layer 1 with a visible message; it never
  blocks the UI or loses work already done in the run.

## Privacy

LLM tagging sends bookmark titles and URLs to Google. That is a real trade and
the UI must say so plainly at the point of enabling — not buried in a policy
link:

> Tagging with Gemini sends the title and address of each bookmark to Google's
> API. Page contents are never sent. Your key is stored on this device only.
> Tagging without Gemini works offline and sends nothing.

Rules:

- Off by default. Enabling is an explicit action.
- The key lives in `chrome.storage.local`, never `sync`, and is never logged.
  Extension storage is not encrypted — say so next to the input field.
- No telemetry, no analytics, no third-party endpoint other than Google's.
- "Delete key and all LLM tags" is a single button in settings.

## Tests

- Rule matching, including suffix matching and precedence between domain and
  keyword hits.
- Merge behaviour: user tags survive, results are deduped and capped at 3.
- Schema validation: a malformed or truncated model response degrades to rules
  and never writes partial garbage.
- Cache: a second run over unchanged bookmarks issues zero requests.
