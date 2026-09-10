# Link checking

The single most correctness-sensitive part of this project. A wrong verdict here
either annoys the user (a live link marked dead) or destroys data (they act on
that verdict). Read this before changing `core/linkcheck/**`.

## Principle

**The checker never decides to delete anything. It reports what it observed.**
A verdict is evidence; the deletion decision belongs to the user, and the UI only
even *offers* deletion for the two strongest verdicts after two agreeing runs.

## Request strategy

For each scannable URL:

1. `HEAD` with `redirect: 'follow'`, an 8 s `AbortSignal.timeout`, and
   `cache: 'no-store'`.
2. If the response is `405`, `501`, or `400`, retry with `GET` — a lot of servers
   simply do not implement `HEAD`.
3. If the response is `200` and we need the body (soft-404 check, meta extraction),
   issue `GET` with `Range: bytes=0-4095` and read only the first chunk. Servers
   that ignore `Range` still work; we abort the stream after 4 KB.
4. On a thrown `TypeError` (the shape `fetch` uses for network-level failure),
   record `DNS_FAIL` **only** if a second attempt after a short delay also throws.

Never send credentials: `credentials: 'omit'`. We are checking public
reachability, not the user's logged-in view.

## Politeness

Scanning 2000 bookmarks hits some hosts dozens of times. Without limits this
looks like an attack and gets the user's IP blocked.

- Global concurrency: 6.
- Per-host concurrency: 2, with at least 200 ms between requests to one host.
- Honour `Retry-After` on `429` and `503`; requeue rather than fail.
- One retry maximum per URL per run, with backoff.

## Skipped entries

Never sent to the network, reported separately in the UI:

`javascript:` · `file:` · `chrome:` · `chrome-extension:` · `data:` · `about:` ·
`localhost` / `0.0.0.0/8` / `127.0.0.0/8` / `100.64.0.0/10` (CGNAT) ·
`::` / `::1` / `fc00::/7` (unique-local) / `fe80::/10` (link-local) /
`::ffff:0:0/96` (IPv4-mapped) · RFC 1918 private ranges · `.local` hosts

Scanning a user's intranet from an extension is both useless and invasive.

## Verdict table

| Observation | Verdict | Deletable | Note |
|---|---|---|---|
| 2xx, body not a not-found page | `ALIVE` | no | |
| 2xx, final URL ≠ requested URL | `REDIRECTED` | no | Offer "update URL" |
| 404 | `DEAD` | after 2 runs | |
| 410 Gone | `DEAD` | after 2 runs | Strongest possible signal |
| 401 | `AUTH_REQUIRED` | **never** | User probably has an account |
| 403 without challenge markers | `AUTH_REQUIRED` | **never** | |
| 403 with challenge markers | `BLOCKED` | **never** | Cloudflare / bot wall |
| 429 | `RATE_LIMITED` | **never** | Our fault, not the site's |
| 5xx | `SERVER_ERROR` | **never** | Retry on a later run |
| 2xx but soft-404 heuristics fire | `SOFT_404` | **never** | Surface for review |
| Timeout | `TIMEOUT` | **never** | |
| Network error twice | `DNS_FAIL` | after 2 runs | Domain likely gone |
| Anything else | `UNKNOWN` | **never** | |

## Bot-challenge markers

A `403` is `BLOCKED` rather than `AUTH_REQUIRED` when any of these appear:

- `cf-mitigated` header, or `server: cloudflare` together with a challenge body
- Body contains `Just a moment...`, `Checking your browser`, `cf-browser-verification`
- `x-datadome`, `x-akamai-bot-manager` style headers

The distinction matters only for the message shown to the user — neither is ever
deletable.

## Soft-404 heuristics

A `200` response that is really a not-found page. Fire `SOFT_404` when **two or
more** of these hold:

1. `<title>` matches `/(^|\W)(404|not[ -]?found|page (not )?found|no longer (exists|available)|removed|đã bị xoá|không tìm thấy)/i`
2. The response body head is under 2 KB of visible text.
3. The final URL was redirected to a path matching `/(404|error|not-found)/i`.
4. An `<h1>` matches the same pattern as (1).

Requiring two signals keeps articles legitimately *about* HTTP 404 from being
flagged. `SOFT_404` is never deletable — it goes to a review list.

## Two-run confirmation

`ScanResult.runCount` increments when a new run produces the same verdict as the
stored one, and resets to 1 when the verdict changes. The UI only offers deletion
for `DEAD` or `DNS_FAIL` with `runCount >= 2`, and the second run must be at
least one hour after the first — a burst of failures during a network outage
should not count twice.

## Test fixtures

`classify.test.ts` must cover every row of the verdict table, plus:

- 405 on `HEAD` then 200 on `GET`
- 301 chain ending at 404
- 200 with a title containing "404" but a full-length body (must stay `ALIVE`)
- 403 with and without Cloudflare markers
- `Retry-After` on 429, both seconds and HTTP-date forms
