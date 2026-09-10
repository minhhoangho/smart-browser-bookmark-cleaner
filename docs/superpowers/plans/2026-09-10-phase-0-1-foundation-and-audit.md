# Phase 0–1: Foundation and Instant Audit — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A working Chrome MV3 extension that, with no permission beyond `bookmarks` and `storage`, opens a dashboard showing duplicate bookmarks, empty folders, and unscannable entries.

**Architecture:** All decision logic lives in `src/core/**` as pure functions over plain data — no `chrome.*`, no `fetch`, no clock. `src/adapters/**` holds thin browser wrappers and is the only place `browser.*` appears. `src/services/**` composes the two. The audit itself is computed from the **live** bookmark tree so it can never be stale; IndexedDB stores the bookmark index that Phase 2's Trash and Phase 3's scan results attach to, kept honest by a pure `reconcile` function.

**Tech Stack:** WXT · React 19 · TypeScript (strict) · Tailwind CSS v4 · `idb` · Vitest + `fakeBrowser` + `fake-indexeddb`

**Spec:** [`docs/superpowers/specs/2026-09-10-bookmark-cleaner-design.md`](../specs/2026-09-10-bookmark-cleaner-design.md)

## Global Constraints

- **Never auto-delete a bookmark.** Phase 1 UI is **read-only** — no delete button exists until Trash lands in Phase 2. (ADR 0006)
- `src/core/**` must not import `wxt/browser`, call `chrome.*`, call `fetch`, or read the clock directly. Anything from outside arrives as an argument.
- `src/adapters/**` contains no business logic — wrappers only.
- TypeScript `strict: true`. No `any`. Prefer discriminated unions over booleans for state.
- Tests colocated: `foo.ts` → `foo.test.ts`. Write the test first for everything in `src/core/**`.
- Manifest permissions in this phase are exactly `["bookmarks", "storage"]`. No host permissions, no `alarms` — those arrive with the features that need them.
- Commit after every task. English, imperative, under ~60 chars, ending with the trailer `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- Node 20+ and pnpm. Pin whatever `pnpm add` resolves; do not hand-edit versions afterwards.

## Deviation from the roadmap

[`docs/roadmap.md`](../../roadmap.md) item 3 pairs shared types with a typed message bus. The bus is **deferred to Phase 3**: in Phase 1 the dashboard is an extension page and can call `browser.bookmarks.getTree()` itself, so a bus would be an unused abstraction. Task 10 updates the roadmap to match.

## File Structure

| File | Responsibility |
|---|---|
| `wxt.config.ts` | WXT config: `srcDir: 'src'`, React module, Tailwind vite plugin, manifest |
| `vitest.config.ts` | Vitest with `WxtVitest()` and happy-dom |
| `src/shared/types.ts` | Domain types shared by core, adapters, and UI |
| `src/core/bookmarks/normalize-url.ts` | Canonical URL form for duplicate detection |
| `src/core/bookmarks/classify-entry.ts` | Which URLs may ever be sent to the network |
| `src/core/bookmarks/flatten.ts` | Nested tree → flat `BookmarkRecord[]` + `FolderRecord[]` |
| `src/core/bookmarks/duplicates.ts` | Group by normalized URL, pick the keeper |
| `src/core/bookmarks/empty-folders.ts` | Folders with no bookmark descendants |
| `src/core/bookmarks/reconcile.ts` | Diff live tree against the stored index |
| `src/adapters/bookmarks.ts` | `browser.bookmarks` wrapper |
| `src/adapters/db.ts` | IndexedDB schema, connection, reads/writes |
| `src/services/sync.ts` | Compose: read tree → flatten → reconcile → persist |
| `src/services/audit.ts` | Compose: read tree → flatten → duplicates + empty folders |
| `src/entrypoints/background.ts` | Run sync on install, startup, and bookmark changes |
| `src/entrypoints/popup/` | Summary counts + "Open dashboard" |
| `src/entrypoints/dashboard/` | The audit view |
| `src/ui/components/` | `SummaryCards`, `DuplicateList`, `EmptyFolderList` |

---

### Task 1: Project scaffold

**Files:**
- Create: `package.json`, `wxt.config.ts`, `tsconfig.json`, `vitest.config.ts`, `src/entrypoints/background.ts`, `src/entrypoints/popup/index.html`, `src/entrypoints/popup/main.tsx`, `src/entrypoints/popup/App.tsx`, `src/entrypoints/popup/style.css`, `src/smoke.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: a working `pnpm dev` / `pnpm build` / `pnpm test` toolchain, and the `@/` path alias resolving to `src/`

- [ ] **Step 1: Initialise the package and install dependencies**

The repository already contains docs and is not empty, so set WXT up manually rather than running `wxt init`.

```bash
pnpm init
pnpm add -D wxt @wxt-dev/module-react typescript @types/react @types/react-dom \
  vitest happy-dom @tailwindcss/vite tailwindcss
pnpm add react react-dom idb
```

- [ ] **Step 2: Write `package.json` scripts**

Replace the `"scripts"` block in `package.json` with:

```json
{
  "type": "module",
  "scripts": {
    "dev": "wxt",
    "build": "wxt build",
    "zip": "wxt zip",
    "postinstall": "wxt prepare",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  }
}
```

- [ ] **Step 3: Write `wxt.config.ts`**

```ts
import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-react'],
  vite: () => ({
    plugins: [tailwindcss()],
  }),
  manifest: {
    name: 'Smart Bookmark Cleaner',
    description: 'Find duplicate, dead, and untagged bookmarks — safely.',
    permissions: ['bookmarks', 'storage'],
  },
});
```

- [ ] **Step 4: Write `tsconfig.json`**

```json
{
  "extends": "./.wxt/tsconfig.json",
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true
  }
}
```

Run `pnpm wxt prepare` once so `.wxt/tsconfig.json` exists. WXT's generated config already maps `@/*` to `src/*`.

- [ ] **Step 5: Write `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';
import { WxtVitest } from 'wxt/testing';

export default defineConfig({
  plugins: [WxtVitest()],
  test: {
    environment: 'happy-dom',
    restoreMocks: true,
  },
});
```

- [ ] **Step 6: Write the minimal entrypoints**

`src/entrypoints/background.ts`:

```ts
export default defineBackground(() => {
  console.info('[sbc] background ready');
});
```

`src/entrypoints/popup/index.html`:

```html
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Smart Bookmark Cleaner</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./main.tsx"></script>
  </body>
</html>
```

`src/entrypoints/popup/style.css`:

```css
@import "tailwindcss";
```

`src/entrypoints/popup/main.tsx`:

```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './style.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
```

`src/entrypoints/popup/App.tsx`:

```tsx
export default function App() {
  return (
    <main className="w-72 p-4">
      <h1 className="text-base font-semibold">Smart Bookmark Cleaner</h1>
    </main>
  );
}
```

- [ ] **Step 7: Write a smoke test**

`src/smoke.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing';

describe('toolchain', () => {
  it('exposes a fake bookmarks API to tests', async () => {
    expect(fakeBrowser.bookmarks).toBeDefined();
  });
});
```

- [ ] **Step 8: Verify the toolchain**

```bash
pnpm typecheck && pnpm test && pnpm build
```

Expected: typecheck clean, one test passing, a build in `.output/chrome-mv3/`. Load that directory via `chrome://extensions` → Load unpacked and confirm the popup renders.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "chore: scaffold wxt project"
```

---

### Task 2: URL normalization

**Files:**
- Create: `src/core/bookmarks/normalize-url.ts`
- Test: `src/core/bookmarks/normalize-url.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `normalizeUrl(raw: string): string`

Two bookmarks are duplicates when their normalized URLs are equal. Normalization must be aggressive enough to catch real duplicates and conservative enough never to merge two genuinely different pages — so tracking parameters go, but meaningful query parameters stay.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { normalizeUrl } from './normalize-url';

describe('normalizeUrl', () => {
  it('unifies scheme, www, case, and trailing slash', () => {
    expect(normalizeUrl('http://www.Example.com/Docs/')).toBe('https://example.com/Docs');
  });

  it('keeps the root path stable', () => {
    expect(normalizeUrl('https://example.com')).toBe(normalizeUrl('https://example.com/'));
  });

  it('drops tracking params but keeps meaningful ones', () => {
    expect(normalizeUrl('https://example.com/p?utm_source=x&fbclid=y&id=7'))
      .toBe('https://example.com/p?id=7');
  });

  it('is insensitive to query parameter order', () => {
    expect(normalizeUrl('https://example.com/p?b=2&a=1'))
      .toBe(normalizeUrl('https://example.com/p?a=1&b=2'));
  });

  it('drops a plain fragment but keeps a hash route', () => {
    expect(normalizeUrl('https://example.com/p#intro')).toBe('https://example.com/p');
    expect(normalizeUrl('https://example.com/#/settings')).toBe('https://example.com/#/settings');
    expect(normalizeUrl('https://example.com/#!/inbox')).toBe('https://example.com/#!/inbox');
  });

  it('drops default ports but keeps explicit ones', () => {
    expect(normalizeUrl('http://example.com:80/a')).toBe('https://example.com/a');
    expect(normalizeUrl('http://example.com:8080/a')).toBe('https://example.com:8080/a');
  });

  it('returns non-http input and unparseable input untouched', () => {
    expect(normalizeUrl('javascript:void(0)')).toBe('javascript:void(0)');
    expect(normalizeUrl('  not a url  ')).toBe('not a url');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run src/core/bookmarks/normalize-url.test.ts`
Expected: FAIL — cannot resolve `./normalize-url`.

- [ ] **Step 3: Write the implementation**

```ts
const TRACKING_PREFIXES = ['utm_'];

const TRACKING_PARAMS = new Set([
  'fbclid', 'gclid', 'gclsrc', 'dclid', 'msclkid', 'yclid',
  'mc_cid', 'mc_eid', 'igshid', 'igsh', 'twclid', 'ttclid',
  '_ga', '_gl', 'ref_src', 'ref_url', 'spm', 'scm',
]);

function isTrackingParam(key: string): boolean {
  const k = key.toLowerCase();
  return TRACKING_PARAMS.has(k) || TRACKING_PREFIXES.some((p) => k.startsWith(p));
}

/**
 * Canonical form of a URL, used as the duplicate-detection key.
 * Non-http(s) and unparseable input is returned trimmed but otherwise untouched.
 */
export function normalizeUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return raw.trim();
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') return raw.trim();

  if (url.protocol === 'http:' && url.port === '80') url.port = '';
  url.protocol = 'https:';
  if (url.port === '443') url.port = '';

  url.username = '';
  url.password = '';
  url.hostname = url.hostname.toLowerCase().replace(/^www\./, '');

  const kept = [...url.searchParams.entries()].filter(([key]) => !isTrackingParam(key));
  kept.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  url.search = '';
  for (const [key, value] of kept) url.searchParams.append(key, value);

  const isHashRoute = url.hash.startsWith('#!') || url.hash.startsWith('#/');
  if (!isHashRoute) url.hash = '';

  if (url.pathname.length > 1 && url.pathname.endsWith('/')) {
    url.pathname = url.pathname.replace(/\/+$/, '');
  }

  return url.toString();
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run src/core/bookmarks/normalize-url.test.ts`
Expected: PASS, 7 tests.

If the hash-route case fails because `URL.toString()` emits `https://example.com/#/settings` while the test expects no trailing slash before the hash, keep the implementation and correct the expectation — the root path always serializes with its slash, and that is consistent for both sides of a comparison.

- [ ] **Step 5: Commit**

```bash
git add src/core/bookmarks/normalize-url.ts src/core/bookmarks/normalize-url.test.ts
git commit -m "feat: add url normalizer"
```

---

### Task 3: Entry classification

**Files:**
- Create: `src/core/bookmarks/classify-entry.ts`
- Test: `src/core/bookmarks/classify-entry.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `isScannable(url: string): boolean`

Decides which URLs may ever be sent to the network. Phase 1 uses it only to list unscannable entries in the audit; Phase 3's scanner depends on it for correctness, so it is worth getting right now. Scanning a user's intranet from an extension is both useless and invasive.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { isScannable } from './classify-entry';

describe('isScannable', () => {
  it('accepts ordinary public http(s) urls', () => {
    expect(isScannable('https://example.com/a')).toBe(true);
    expect(isScannable('http://example.com')).toBe(true);
  });

  it('rejects non-web schemes', () => {
    for (const url of [
      'javascript:void(0)',
      'file:///Users/me/notes.txt',
      'chrome://extensions',
      'chrome-extension://abc/page.html',
      'data:text/html,hi',
      'about:blank',
    ]) {
      expect(isScannable(url), url).toBe(false);
    }
  });

  it('rejects loopback and private hosts', () => {
    for (const url of [
      'http://localhost:3000',
      'http://127.0.0.1/x',
      'http://[::1]/x',
      'http://192.168.1.10/x',
      'http://10.0.0.5/x',
      'http://172.16.4.2/x',
      'http://169.254.1.1/x',
      'http://nas.local/x',
    ]) {
      expect(isScannable(url), url).toBe(false);
    }
  });

  it('rejects unparseable input', () => {
    expect(isScannable('not a url')).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run src/core/bookmarks/classify-entry.test.ts`
Expected: FAIL — cannot resolve `./classify-entry`.

- [ ] **Step 3: Write the implementation**

```ts
const PRIVATE_IPV4 =
  /^(10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/;

/** True when this URL may be sent to the network by the link scanner. */
export function isScannable(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return false;
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;

  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost')) return false;
  if (host === '::1' || host === '0.0.0.0') return false;
  if (host.endsWith('.local')) return false;
  if (PRIVATE_IPV4.test(host)) return false;

  return true;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run src/core/bookmarks/classify-entry.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/core/bookmarks/classify-entry.ts src/core/bookmarks/classify-entry.test.ts
git commit -m "feat: classify unscannable bookmark entries"
```

---

### Task 4: Domain types and tree flattening

**Files:**
- Create: `src/shared/types.ts`, `src/core/bookmarks/flatten.ts`
- Test: `src/core/bookmarks/flatten.test.ts`

**Interfaces:**
- Consumes: `normalizeUrl` (Task 2), `isScannable` (Task 3)
- Produces: types `BookmarkNode`, `BookmarkRecord`, `FolderRecord`, `FlattenResult`; function `flattenTree(roots: BookmarkNode[]): FlattenResult`

`BookmarkNode` is our own structural type, not the browser's. That is deliberate: `src/core/**` must not import browser types, and a structural type keeps core independent of the extension API's version-to-version churn. The adapter in Task 8 supplies browser nodes, which are structurally compatible.

Chrome's tree is rooted at an invisible node (id `'0'`, empty title) whose children are the built-in top-level folders (Bookmarks bar, Other bookmarks, Mobile bookmarks). Neither the root nor those built-ins may ever be reported as deletable, so `flattenTree` marks folders at depth ≤ 1 as protected.

- [ ] **Step 1: Write `src/shared/types.ts`**

```ts
/** Structural mirror of a browser bookmark tree node. Core code depends on this, never on the browser's own type. */
export interface BookmarkNode {
  id: string;
  parentId?: string;
  index?: number;
  title: string;
  /** Absent on folders. */
  url?: string;
  dateAdded?: number;
  children?: BookmarkNode[];
}

export interface BookmarkRecord {
  id: string;
  parentId: string;
  /** Enclosing folder names, outermost first. Excludes the invisible root. */
  path: string[];
  index: number;
  title: string;
  url: string;
  normalizedUrl: string;
  dateAdded: number;
  scannable: boolean;
}

export interface FolderRecord {
  id: string;
  parentId: string;
  /** Enclosing folder names, outermost first. Excludes this folder itself. */
  path: string[];
  title: string;
  /** 1 for the built-in top-level folders, 2 for their children, and so on. */
  depth: number;
  /** Built-in folders that must never be offered for deletion. */
  isProtected: boolean;
}
```

- [ ] **Step 2: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { flattenTree } from './flatten';
import type { BookmarkNode } from '@/shared/types';

const tree: BookmarkNode[] = [
  {
    id: '0',
    title: '',
    children: [
      {
        id: '1',
        parentId: '0',
        title: 'Bookmarks bar',
        children: [
          { id: '10', parentId: '1', index: 0, title: 'Example', url: 'https://example.com/', dateAdded: 100 },
          {
            id: '11',
            parentId: '1',
            title: 'Dev',
            children: [
              { id: '110', parentId: '11', index: 0, title: 'Repo', url: 'https://github.com/a/b', dateAdded: 200 },
              { id: '111', parentId: '11', index: 1, title: 'Bookmarklet', url: 'javascript:alert(1)', dateAdded: 300 },
            ],
          },
        ],
      },
      { id: '2', parentId: '0', title: 'Other bookmarks', children: [] },
    ],
  },
];

describe('flattenTree', () => {
  it('returns every bookmark with its folder path', () => {
    const { bookmarks } = flattenTree(tree);
    expect(bookmarks.map((b) => b.id)).toEqual(['10', '110', '111']);
    expect(bookmarks[0]!.path).toEqual(['Bookmarks bar']);
    expect(bookmarks[1]!.path).toEqual(['Bookmarks bar', 'Dev']);
  });

  it('normalizes urls and marks scannability', () => {
    const { bookmarks } = flattenTree(tree);
    expect(bookmarks[0]!.normalizedUrl).toBe('https://example.com/');
    expect(bookmarks[0]!.scannable).toBe(true);
    expect(bookmarks[2]!.scannable).toBe(false);
  });

  it('returns folders without the invisible root, with depth and protection', () => {
    const { folders } = flattenTree(tree);
    expect(folders.map((f) => f.id)).toEqual(['1', '11', '2']);
    expect(folders.find((f) => f.id === '1')).toMatchObject({ depth: 1, isProtected: true, path: [] });
    expect(folders.find((f) => f.id === '11')).toMatchObject({ depth: 2, isProtected: false, path: ['Bookmarks bar'] });
  });

  it('fills in missing optional fields', () => {
    const { bookmarks } = flattenTree([
      { id: '9', title: 'Bare', url: 'https://bare.test/' },
    ]);
    expect(bookmarks[0]).toMatchObject({ parentId: '', index: 0, dateAdded: 0, path: [] });
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm vitest run src/core/bookmarks/flatten.test.ts`
Expected: FAIL — cannot resolve `./flatten`.

- [ ] **Step 4: Write the implementation**

```ts
import type { BookmarkNode, BookmarkRecord, FolderRecord } from '@/shared/types';
import { normalizeUrl } from './normalize-url';
import { isScannable } from './classify-entry';

export interface FlattenResult {
  bookmarks: BookmarkRecord[];
  folders: FolderRecord[];
}

/** Depth-first flatten of the browser's bookmark tree, preserving folder paths. */
export function flattenTree(roots: BookmarkNode[]): FlattenResult {
  const bookmarks: BookmarkRecord[] = [];
  const folders: FolderRecord[] = [];

  const walk = (node: BookmarkNode, path: string[], depth: number): void => {
    if (node.url === undefined) {
      // depth 0 is the invisible root, which is not a folder the user can see
      if (depth > 0) {
        folders.push({
          id: node.id,
          parentId: node.parentId ?? '',
          path,
          title: node.title,
          depth,
          isProtected: depth <= 1,
        });
      }
      const childPath = depth > 0 ? [...path, node.title] : path;
      for (const child of node.children ?? []) walk(child, childPath, depth + 1);
      return;
    }

    bookmarks.push({
      id: node.id,
      parentId: node.parentId ?? '',
      path,
      index: node.index ?? 0,
      title: node.title,
      url: node.url,
      normalizedUrl: normalizeUrl(node.url),
      dateAdded: node.dateAdded ?? 0,
      scannable: isScannable(node.url),
    });
  };

  for (const root of roots) walk(root, [], 0);
  return { bookmarks, folders };
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm vitest run src/core/bookmarks/flatten.test.ts`
Expected: PASS, 4 tests.

Note on the fourth test: a bare node passed as a root is treated as depth 0 and therefore has `path: []`. That is correct — it has no enclosing folder.

- [ ] **Step 6: Commit**

```bash
git add src/shared/types.ts src/core/bookmarks/flatten.ts src/core/bookmarks/flatten.test.ts
git commit -m "feat: flatten bookmark tree into records"
```

---

### Task 5: Duplicate detection

**Files:**
- Create: `src/core/bookmarks/duplicates.ts`
- Test: `src/core/bookmarks/duplicates.test.ts`

**Interfaces:**
- Consumes: `BookmarkRecord` (Task 4)
- Produces: type `DuplicateGroup`; function `findDuplicates(records: BookmarkRecord[]): DuplicateGroup[]`

Every group names one **keeper** — the copy the user most likely wants to keep — and the rest as duplicates. The keeper rule must be total and deterministic so the same library always produces the same suggestion: shallowest folder first, then oldest, then lowest id as a tiebreak.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { findDuplicates } from './duplicates';
import type { BookmarkRecord } from '@/shared/types';

function rec(over: Partial<BookmarkRecord> & Pick<BookmarkRecord, 'id' | 'normalizedUrl'>): BookmarkRecord {
  return {
    parentId: '1',
    path: ['Bookmarks bar'],
    index: 0,
    title: 'x',
    url: 'https://example.com/',
    dateAdded: 0,
    scannable: true,
    ...over,
  };
}

describe('findDuplicates', () => {
  it('ignores urls that appear once', () => {
    const groups = findDuplicates([
      rec({ id: 'a', normalizedUrl: 'https://a.test/' }),
      rec({ id: 'b', normalizedUrl: 'https://b.test/' }),
    ]);
    expect(groups).toEqual([]);
  });

  it('prefers the shallowest copy as keeper', () => {
    const groups = findDuplicates([
      rec({ id: 'deep', normalizedUrl: 'https://a.test/', path: ['Bar', 'Dev', 'Rust'] }),
      rec({ id: 'shallow', normalizedUrl: 'https://a.test/', path: ['Bar'] }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.keeper.id).toBe('shallow');
    expect(groups[0]!.duplicates.map((d) => d.id)).toEqual(['deep']);
  });

  it('breaks a depth tie with the oldest copy', () => {
    const groups = findDuplicates([
      rec({ id: 'new', normalizedUrl: 'https://a.test/', dateAdded: 500 }),
      rec({ id: 'old', normalizedUrl: 'https://a.test/', dateAdded: 100 }),
    ]);
    expect(groups[0]!.keeper.id).toBe('old');
  });

  it('is deterministic when depth and date tie', () => {
    const input = [
      rec({ id: 'b', normalizedUrl: 'https://a.test/' }),
      rec({ id: 'a', normalizedUrl: 'https://a.test/' }),
    ];
    expect(findDuplicates(input)[0]!.keeper.id).toBe('a');
    expect(findDuplicates([...input].reverse())[0]!.keeper.id).toBe('a');
  });

  it('groups three copies and orders groups by size', () => {
    const groups = findDuplicates([
      rec({ id: 'p1', normalizedUrl: 'https://pair.test/' }),
      rec({ id: 'p2', normalizedUrl: 'https://pair.test/' }),
      rec({ id: 't1', normalizedUrl: 'https://trio.test/' }),
      rec({ id: 't2', normalizedUrl: 'https://trio.test/' }),
      rec({ id: 't3', normalizedUrl: 'https://trio.test/' }),
    ]);
    expect(groups.map((g) => g.normalizedUrl)).toEqual(['https://trio.test/', 'https://pair.test/']);
    expect(groups[0]!.duplicates).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run src/core/bookmarks/duplicates.test.ts`
Expected: FAIL — cannot resolve `./duplicates`.

- [ ] **Step 3: Write the implementation**

```ts
import type { BookmarkRecord } from '@/shared/types';

export interface DuplicateGroup {
  normalizedUrl: string;
  /** The copy to keep: shallowest, then oldest, then lowest id. */
  keeper: BookmarkRecord;
  /** Every other copy, in the same order. Never empty. */
  duplicates: BookmarkRecord[];
}

function compareKeeper(a: BookmarkRecord, b: BookmarkRecord): number {
  if (a.path.length !== b.path.length) return a.path.length - b.path.length;
  if (a.dateAdded !== b.dateAdded) return a.dateAdded - b.dateAdded;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** Groups bookmarks sharing a normalized URL. Largest groups first. */
export function findDuplicates(records: BookmarkRecord[]): DuplicateGroup[] {
  const byUrl = new Map<string, BookmarkRecord[]>();
  for (const record of records) {
    const existing = byUrl.get(record.normalizedUrl);
    if (existing) existing.push(record);
    else byUrl.set(record.normalizedUrl, [record]);
  }

  const groups: DuplicateGroup[] = [];
  for (const [normalizedUrl, members] of byUrl) {
    if (members.length < 2) continue;
    const sorted = [...members].sort(compareKeeper);
    groups.push({ normalizedUrl, keeper: sorted[0]!, duplicates: sorted.slice(1) });
  }

  groups.sort(
    (a, b) =>
      b.duplicates.length - a.duplicates.length ||
      (a.normalizedUrl < b.normalizedUrl ? -1 : 1),
  );
  return groups;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run src/core/bookmarks/duplicates.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/core/bookmarks/duplicates.ts src/core/bookmarks/duplicates.test.ts
git commit -m "feat: detect duplicate bookmarks"
```

---

### Task 6: Empty folder detection

**Files:**
- Create: `src/core/bookmarks/empty-folders.ts`
- Test: `src/core/bookmarks/empty-folders.test.ts`

**Interfaces:**
- Consumes: `BookmarkRecord`, `FolderRecord` (Task 4)
- Produces: `findEmptyFolders(folders: FolderRecord[], bookmarks: BookmarkRecord[]): FolderRecord[]`

A folder is empty when it has no bookmark **anywhere** beneath it — a folder containing only other empty folders counts as empty. Protected built-in folders are never reported even when they hold nothing.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { findEmptyFolders } from './empty-folders';
import type { BookmarkRecord, FolderRecord } from '@/shared/types';

const folders: FolderRecord[] = [
  { id: '1', parentId: '0', path: [], title: 'Bookmarks bar', depth: 1, isProtected: true },
  { id: '2', parentId: '0', path: [], title: 'Other bookmarks', depth: 1, isProtected: true },
  { id: '10', parentId: '1', path: ['Bookmarks bar'], title: 'Dev', depth: 2, isProtected: false },
  { id: '100', parentId: '10', path: ['Bookmarks bar', 'Dev'], title: 'Rust', depth: 3, isProtected: false },
  { id: '11', parentId: '1', path: ['Bookmarks bar'], title: 'Old', depth: 2, isProtected: false },
  { id: '110', parentId: '11', path: ['Bookmarks bar', 'Old'], title: 'Older', depth: 3, isProtected: false },
];

const bookmarks: BookmarkRecord[] = [
  {
    id: 'b1', parentId: '100', path: ['Bookmarks bar', 'Dev', 'Rust'], index: 0,
    title: 'Rust book', url: 'https://doc.rust-lang.org/book/',
    normalizedUrl: 'https://doc.rust-lang.org/book', dateAdded: 1, scannable: true,
  },
];

describe('findEmptyFolders', () => {
  it('reports folders with no bookmark descendants', () => {
    expect(findEmptyFolders(folders, bookmarks).map((f) => f.id)).toEqual(['11', '110']);
  });

  it('treats an ancestor of a deeply nested bookmark as non-empty', () => {
    const ids = findEmptyFolders(folders, bookmarks).map((f) => f.id);
    expect(ids).not.toContain('10');
    expect(ids).not.toContain('100');
  });

  it('never reports protected folders', () => {
    expect(findEmptyFolders(folders, []).map((f) => f.id)).toEqual(['10', '100', '11', '110']);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run src/core/bookmarks/empty-folders.test.ts`
Expected: FAIL — cannot resolve `./empty-folders`.

- [ ] **Step 3: Write the implementation**

```ts
import type { BookmarkRecord, FolderRecord } from '@/shared/types';

/**
 * Folders with no bookmark anywhere beneath them. Protected built-in folders
 * are never returned. Walks each bookmark's ancestor chain once, stopping as
 * soon as it reaches a folder already known to be non-empty.
 */
export function findEmptyFolders(
  folders: FolderRecord[],
  bookmarks: BookmarkRecord[],
): FolderRecord[] {
  const byId = new Map(folders.map((f) => [f.id, f]));
  const nonEmpty = new Set<string>();

  for (const bookmark of bookmarks) {
    let cursor: string | undefined = bookmark.parentId;
    while (cursor && !nonEmpty.has(cursor)) {
      nonEmpty.add(cursor);
      cursor = byId.get(cursor)?.parentId;
    }
  }

  return folders.filter((f) => !f.isProtected && !nonEmpty.has(f.id));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run src/core/bookmarks/empty-folders.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/core/bookmarks/empty-folders.ts src/core/bookmarks/empty-folders.test.ts
git commit -m "feat: detect empty bookmark folders"
```

---

### Task 7: Reconcile the stored index against the live tree

**Files:**
- Create: `src/core/bookmarks/reconcile.ts`
- Test: `src/core/bookmarks/reconcile.test.ts`

**Interfaces:**
- Consumes: `BookmarkRecord` (Task 4)
- Produces: type `ReconcilePlan`; function `reconcile(live: BookmarkRecord[], stored: BookmarkRecord[]): ReconcilePlan`

Bookmarks change outside the extension. This pure diff produces the plan the adapter applies. The distinction that matters: a **moved or renamed** bookmark keeps whatever the scanner and tagger learned about it, whereas a bookmark whose **URL changed** is a different page — its scan results and tags must be discarded, so it is reported separately as `invalidated`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { reconcile } from './reconcile';
import type { BookmarkRecord } from '@/shared/types';

function rec(over: Partial<BookmarkRecord> & Pick<BookmarkRecord, 'id'>): BookmarkRecord {
  return {
    parentId: '1',
    path: ['Bookmarks bar'],
    index: 0,
    title: 'Example',
    url: 'https://example.com/',
    normalizedUrl: 'https://example.com/',
    dateAdded: 1,
    scannable: true,
    ...over,
  };
}

describe('reconcile', () => {
  it('reports nothing to do when the two sides match', () => {
    const same = [rec({ id: 'a' })];
    expect(reconcile(same, [rec({ id: 'a' })])).toEqual({
      added: [], updated: [], removed: [], invalidated: [],
    });
  });

  it('reports bookmarks added outside the extension', () => {
    const plan = reconcile([rec({ id: 'a' }), rec({ id: 'b' })], [rec({ id: 'a' })]);
    expect(plan.added.map((r) => r.id)).toEqual(['b']);
  });

  it('reports bookmarks removed outside the extension', () => {
    const plan = reconcile([rec({ id: 'a' })], [rec({ id: 'a' }), rec({ id: 'gone' })]);
    expect(plan.removed).toEqual(['gone']);
  });

  it('updates a moved or renamed bookmark without invalidating it', () => {
    const plan = reconcile(
      [rec({ id: 'a', title: 'Renamed', parentId: '9', path: ['Bookmarks bar', 'Dev'] })],
      [rec({ id: 'a' })],
    );
    expect(plan.updated.map((r) => r.id)).toEqual(['a']);
    expect(plan.invalidated).toEqual([]);
  });

  it('invalidates a bookmark whose url changed', () => {
    const plan = reconcile(
      [rec({ id: 'a', url: 'https://other.test/', normalizedUrl: 'https://other.test/' })],
      [rec({ id: 'a' })],
    );
    expect(plan.updated.map((r) => r.id)).toEqual(['a']);
    expect(plan.invalidated).toEqual(['a']);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run src/core/bookmarks/reconcile.test.ts`
Expected: FAIL — cannot resolve `./reconcile`.

- [ ] **Step 3: Write the implementation**

```ts
import type { BookmarkRecord } from '@/shared/types';

export interface ReconcilePlan {
  added: BookmarkRecord[];
  updated: BookmarkRecord[];
  /** Ids present in the index but no longer in the browser. */
  removed: string[];
  /** Ids whose URL changed: derived data about them is no longer valid. */
  invalidated: string[];
}

function isSamePlacement(a: BookmarkRecord, b: BookmarkRecord): boolean {
  return (
    a.title === b.title &&
    a.parentId === b.parentId &&
    a.index === b.index &&
    a.path.length === b.path.length &&
    a.path.every((segment, i) => segment === b.path[i])
  );
}

/** Diffs the live bookmark tree against the stored index. Pure. */
export function reconcile(
  live: BookmarkRecord[],
  stored: BookmarkRecord[],
): ReconcilePlan {
  const storedById = new Map(stored.map((r) => [r.id, r]));
  const plan: ReconcilePlan = { added: [], updated: [], removed: [], invalidated: [] };

  for (const record of live) {
    const previous = storedById.get(record.id);
    if (!previous) {
      plan.added.push(record);
      continue;
    }
    storedById.delete(record.id);

    if (previous.url !== record.url) {
      plan.updated.push(record);
      plan.invalidated.push(record.id);
    } else if (!isSamePlacement(previous, record)) {
      plan.updated.push(record);
    }
  }

  plan.removed = [...storedById.keys()];
  return plan;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run src/core/bookmarks/reconcile.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/core/bookmarks/reconcile.ts src/core/bookmarks/reconcile.test.ts
git commit -m "feat: reconcile stored index with live tree"
```

---

### Task 8: The audit report

**Files:**
- Create: `src/core/bookmarks/audit.ts`
- Test: `src/core/bookmarks/audit.test.ts`

**Interfaces:**
- Consumes: `flattenTree` (Task 4), `findDuplicates` (Task 5), `findEmptyFolders` (Task 6)
- Produces: type `AuditReport`; function `buildAuditReport(tree: BookmarkNode[]): AuditReport`

The report is computed from the **live** tree rather than from the stored index, so it can never show stale results. Keeping it a pure function of the tree means the whole audit is testable without a browser.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { buildAuditReport } from './audit';
import type { BookmarkNode } from '@/shared/types';

const tree: BookmarkNode[] = [
  {
    id: '0',
    title: '',
    children: [
      {
        id: '1',
        parentId: '0',
        title: 'Bookmarks bar',
        children: [
          { id: '10', parentId: '1', index: 0, title: 'Example', url: 'https://example.com/', dateAdded: 100 },
          { id: '11', parentId: '1', index: 1, title: 'Example again', url: 'https://www.example.com/?utm_source=x', dateAdded: 200 },
          { id: '12', parentId: '1', index: 2, title: 'Local', url: 'http://localhost:3000/', dateAdded: 300 },
          { id: '13', parentId: '1', title: 'Empty', children: [] },
        ],
      },
    ],
  },
];

describe('buildAuditReport', () => {
  it('counts bookmarks and folders', () => {
    const report = buildAuditReport(tree);
    expect(report.totalBookmarks).toBe(3);
    expect(report.totalFolders).toBe(2);
  });

  it('groups duplicates across www, scheme, and tracking params', () => {
    const report = buildAuditReport(tree);
    expect(report.duplicateGroups).toHaveLength(1);
    expect(report.duplicateGroups[0]!.keeper.id).toBe('10');
    expect(report.duplicateGroups[0]!.duplicates.map((d) => d.id)).toEqual(['11']);
  });

  it('lists empty folders and unscannable entries', () => {
    const report = buildAuditReport(tree);
    expect(report.emptyFolders.map((f) => f.id)).toEqual(['13']);
    expect(report.unscannable.map((b) => b.id)).toEqual(['12']);
  });

  it('reports how many bookmarks are removable without losing a url', () => {
    expect(buildAuditReport(tree).redundantCount).toBe(1);
  });

  it('handles an empty tree', () => {
    const report = buildAuditReport([]);
    expect(report).toMatchObject({
      totalBookmarks: 0, totalFolders: 0, redundantCount: 0,
      duplicateGroups: [], emptyFolders: [], unscannable: [],
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run src/core/bookmarks/audit.test.ts`
Expected: FAIL — cannot resolve `./audit`.

- [ ] **Step 3: Write the implementation**

```ts
import type { BookmarkNode, BookmarkRecord, FolderRecord } from '@/shared/types';
import { flattenTree } from './flatten';
import { findDuplicates, type DuplicateGroup } from './duplicates';
import { findEmptyFolders } from './empty-folders';

export interface AuditReport {
  totalBookmarks: number;
  totalFolders: number;
  duplicateGroups: DuplicateGroup[];
  emptyFolders: FolderRecord[];
  /** Entries the link scanner will never touch: bookmarklets, local files, intranet hosts. */
  unscannable: BookmarkRecord[];
  /** Bookmarks that could be removed without losing any distinct URL. */
  redundantCount: number;
}

/** The complete offline audit, as a pure function of the bookmark tree. */
export function buildAuditReport(tree: BookmarkNode[]): AuditReport {
  const { bookmarks, folders } = flattenTree(tree);
  const duplicateGroups = findDuplicates(bookmarks);

  return {
    totalBookmarks: bookmarks.length,
    totalFolders: folders.length,
    duplicateGroups,
    emptyFolders: findEmptyFolders(folders, bookmarks),
    unscannable: bookmarks.filter((b) => !b.scannable),
    redundantCount: duplicateGroups.reduce((sum, g) => sum + g.duplicates.length, 0),
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run src/core/bookmarks/audit.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/core/bookmarks/audit.ts src/core/bookmarks/audit.test.ts
git commit -m "feat: build offline audit report"
```

---

### Task 9: Persistence and the sync service

**Files:**
- Create: `src/adapters/db.ts`, `src/adapters/bookmarks.ts`, `src/services/sync.ts`
- Test: `src/adapters/db.test.ts`, `src/services/sync.test.ts`
- Modify: `CLAUDE.md` (add `src/services/` to the layout)

**Interfaces:**
- Consumes: `BookmarkRecord` (Task 4), `ReconcilePlan` and `reconcile` (Task 7), `flattenTree` (Task 4)
- Produces:
  - `getDb(): Promise<IDBPDatabase<SbcSchema>>`, `resetDbConnection(): void`
  - `getAllBookmarks(): Promise<BookmarkRecord[]>`, `applyReconcilePlan(plan: ReconcilePlan): Promise<void>`
  - `getBookmarkTree(): Promise<BookmarkNode[]>`
  - `syncBookmarkIndex(): Promise<ReconcilePlan>`, `scheduleSync(delayMs?: number): void`

This is the first task where the DB earns its place: Phase 2's Trash and Phase 3's scan results both attach to this index, and the schema-versioning pattern is established once, here.

- [ ] **Step 1: Install the test dependency**

```bash
pnpm add -D fake-indexeddb
```

- [ ] **Step 2: Write the failing DB test**

`src/adapters/db.test.ts`:

```ts
import 'fake-indexeddb/auto';
import { deleteDB } from 'idb';
import { beforeEach, describe, expect, it } from 'vitest';
import { applyReconcilePlan, getAllBookmarks, resetDbConnection, DB_NAME } from './db';
import type { BookmarkRecord } from '@/shared/types';

function rec(id: string, url = `https://${id}.test/`): BookmarkRecord {
  return {
    id, parentId: '1', path: ['Bookmarks bar'], index: 0, title: id,
    url, normalizedUrl: url, dateAdded: 1, scannable: true,
  };
}

describe('db', () => {
  beforeEach(async () => {
    resetDbConnection();
    await deleteDB(DB_NAME);
  });

  it('starts empty', async () => {
    expect(await getAllBookmarks()).toEqual([]);
  });

  it('applies additions and updates', async () => {
    await applyReconcilePlan({ added: [rec('a'), rec('b')], updated: [], removed: [], invalidated: [] });
    await applyReconcilePlan({ added: [], updated: [rec('a', 'https://changed.test/')], removed: [], invalidated: ['a'] });

    const all = await getAllBookmarks();
    expect(all).toHaveLength(2);
    expect(all.find((r) => r.id === 'a')!.url).toBe('https://changed.test/');
  });

  it('applies removals', async () => {
    await applyReconcilePlan({ added: [rec('a'), rec('b')], updated: [], removed: [], invalidated: [] });
    await applyReconcilePlan({ added: [], updated: [], removed: ['a'], invalidated: [] });
    expect((await getAllBookmarks()).map((r) => r.id)).toEqual(['b']);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm vitest run src/adapters/db.test.ts`
Expected: FAIL — cannot resolve `./db`.

- [ ] **Step 4: Write the adapters**

`src/adapters/db.ts`:

```ts
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { BookmarkRecord } from '@/shared/types';
import type { ReconcilePlan } from '@/core/bookmarks/reconcile';

export interface SbcSchema extends DBSchema {
  bookmarks: {
    key: string;
    value: BookmarkRecord;
    indexes: { 'by-normalized-url': string };
  };
}

export const DB_NAME = 'sbc';
export const DB_VERSION = 1;

let connection: Promise<IDBPDatabase<SbcSchema>> | undefined;

export function getDb(): Promise<IDBPDatabase<SbcSchema>> {
  connection ??= openDB<SbcSchema>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      const store = db.createObjectStore('bookmarks', { keyPath: 'id' });
      store.createIndex('by-normalized-url', 'normalizedUrl');
    },
  });
  return connection;
}

/** Test hook: drops the cached connection so a fresh database can be opened. */
export function resetDbConnection(): void {
  connection = undefined;
}

export async function getAllBookmarks(): Promise<BookmarkRecord[]> {
  return (await getDb()).getAll('bookmarks');
}

/**
 * Writes a reconcile plan in one transaction.
 * `plan.invalidated` is intentionally a no-op here: the derived stores it would
 * clear (scan results, tags) do not exist until Phase 3.
 */
export async function applyReconcilePlan(plan: ReconcilePlan): Promise<void> {
  const db = await getDb();
  const tx = db.transaction('bookmarks', 'readwrite');
  const writes: Promise<unknown>[] = [];
  for (const record of [...plan.added, ...plan.updated]) writes.push(tx.store.put(record));
  for (const id of plan.removed) writes.push(tx.store.delete(id));
  await Promise.all(writes);
  await tx.done;
}
```

`src/adapters/bookmarks.ts`:

```ts
import { browser } from 'wxt/browser';
import type { BookmarkNode } from '@/shared/types';

/**
 * The browser's own node type carries extra fields we ignore; the cast keeps
 * `src/core/**` free of any dependency on the extension API's types.
 */
export async function getBookmarkTree(): Promise<BookmarkNode[]> {
  return (await browser.bookmarks.getTree()) as BookmarkNode[];
}
```

- [ ] **Step 5: Run the DB test to verify it passes**

Run: `pnpm vitest run src/adapters/db.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 6: Write the failing sync-service test**

`src/services/sync.test.ts`:

```ts
import 'fake-indexeddb/auto';
import { deleteDB } from 'idb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BookmarkNode } from '@/shared/types';

const tree: BookmarkNode[] = [
  {
    id: '0',
    title: '',
    children: [
      {
        id: '1',
        parentId: '0',
        title: 'Bookmarks bar',
        children: [{ id: '10', parentId: '1', index: 0, title: 'Example', url: 'https://example.com/', dateAdded: 1 }],
      },
    ],
  },
];

const getBookmarkTree = vi.fn<() => Promise<BookmarkNode[]>>();
vi.mock('@/adapters/bookmarks', () => ({ getBookmarkTree: () => getBookmarkTree() }));

const { syncBookmarkIndex } = await import('./sync');
const { getAllBookmarks, resetDbConnection, DB_NAME } = await import('@/adapters/db');

describe('syncBookmarkIndex', () => {
  beforeEach(async () => {
    resetDbConnection();
    await deleteDB(DB_NAME);
    getBookmarkTree.mockReset();
  });

  it('writes the live tree into an empty index', async () => {
    getBookmarkTree.mockResolvedValue(tree);
    const plan = await syncBookmarkIndex();

    expect(plan.added.map((r) => r.id)).toEqual(['10']);
    expect((await getAllBookmarks()).map((r) => r.id)).toEqual(['10']);
  });

  it('is idempotent when nothing changed', async () => {
    getBookmarkTree.mockResolvedValue(tree);
    await syncBookmarkIndex();
    const second = await syncBookmarkIndex();

    expect(second).toEqual({ added: [], updated: [], removed: [], invalidated: [] });
    expect(await getAllBookmarks()).toHaveLength(1);
  });

  it('drops bookmarks deleted outside the extension', async () => {
    getBookmarkTree.mockResolvedValue(tree);
    await syncBookmarkIndex();

    getBookmarkTree.mockResolvedValue([{ id: '0', title: '', children: [] }]);
    const plan = await syncBookmarkIndex();

    expect(plan.removed).toEqual(['10']);
    expect(await getAllBookmarks()).toEqual([]);
  });
});
```

- [ ] **Step 7: Run the test to verify it fails**

Run: `pnpm vitest run src/services/sync.test.ts`
Expected: FAIL — cannot resolve `./sync`.

- [ ] **Step 8: Write the sync service**

`src/services/sync.ts`:

```ts
import { getBookmarkTree } from '@/adapters/bookmarks';
import { applyReconcilePlan, getAllBookmarks } from '@/adapters/db';
import { flattenTree } from '@/core/bookmarks/flatten';
import { reconcile, type ReconcilePlan } from '@/core/bookmarks/reconcile';

/** Brings the stored index in line with the browser's bookmark tree. Idempotent. */
export async function syncBookmarkIndex(): Promise<ReconcilePlan> {
  const [tree, stored] = await Promise.all([getBookmarkTree(), getAllBookmarks()]);
  const { bookmarks } = flattenTree(tree);
  const plan = reconcile(bookmarks, stored);
  await applyReconcilePlan(plan);
  return plan;
}

let pending: ReturnType<typeof setTimeout> | undefined;

/**
 * Coalesces the burst of events the browser emits during a drag or an import
 * into a single sync. Losing the timer to a terminated service worker is
 * harmless: the next startup or dashboard open syncs anyway.
 */
export function scheduleSync(delayMs = 2000): void {
  if (pending !== undefined) clearTimeout(pending);
  pending = setTimeout(() => {
    pending = undefined;
    void syncBookmarkIndex();
  }, delayMs);
}
```

- [ ] **Step 9: Run the test to verify it passes**

Run: `pnpm vitest run src/services/sync.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 10: Record the new directory in `CLAUDE.md`**

In the `## Layout` code block, add this line directly beneath the `adapters/` line:

```
  services/           # composition: adapters + core, no logic of its own
```

- [ ] **Step 11: Commit**

```bash
git add src/adapters src/services CLAUDE.md package.json pnpm-lock.yaml
git commit -m "feat: add indexeddb index and sync service"
```

---

### Task 10: Background wiring

**Files:**
- Modify: `src/entrypoints/background.ts`
- Test: `src/entrypoints/background.test.ts`

**Interfaces:**
- Consumes: `syncBookmarkIndex`, `scheduleSync` (Task 9)
- Produces: nothing importable — this is the composition root for background work

- [ ] **Step 1: Write the failing test**

`src/entrypoints/background.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing';

const syncBookmarkIndex = vi.fn(async () => ({ added: [], updated: [], removed: [], invalidated: [] }));
const scheduleSync = vi.fn();
vi.mock('@/services/sync', () => ({
  syncBookmarkIndex: () => syncBookmarkIndex(),
  scheduleSync: () => scheduleSync(),
}));

const { default: background } = await import('./background');

describe('background', () => {
  beforeEach(() => {
    fakeBrowser.reset();
    syncBookmarkIndex.mockClear();
    scheduleSync.mockClear();
    background.main();
  });

  it('syncs the index on install', async () => {
    await fakeBrowser.runtime.onInstalled.trigger({ reason: 'install' });
    expect(syncBookmarkIndex).toHaveBeenCalledOnce();
  });

  it('syncs the index on browser startup', async () => {
    await fakeBrowser.runtime.onStartup.trigger();
    expect(syncBookmarkIndex).toHaveBeenCalledOnce();
  });

  it('schedules a debounced sync when a bookmark is created', async () => {
    await fakeBrowser.bookmarks.onCreated.trigger('10', {
      id: '10', title: 'New', url: 'https://new.test/',
    });
    expect(scheduleSync).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run src/entrypoints/background.test.ts`
Expected: FAIL — the background currently only logs, so no sync is called.

- [ ] **Step 3: Write the implementation**

`src/entrypoints/background.ts`:

```ts
import { browser } from 'wxt/browser';
import { scheduleSync, syncBookmarkIndex } from '@/services/sync';

export default defineBackground(() => {
  browser.runtime.onInstalled.addListener(() => void syncBookmarkIndex());
  browser.runtime.onStartup.addListener(() => void syncBookmarkIndex());

  const changeEvents = [
    browser.bookmarks.onCreated,
    browser.bookmarks.onRemoved,
    browser.bookmarks.onChanged,
    browser.bookmarks.onMoved,
  ];
  for (const event of changeEvents) {
    event.addListener(() => scheduleSync());
  }
});
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run src/entrypoints/background.test.ts`
Expected: PASS, 3 tests.

If `fakeBrowser.bookmarks.onCreated.trigger` is unavailable in the installed version of `@webext-core/fake-browser`, drop that third test and assert instead that four change listeners were registered, via `expect(browser.bookmarks.onCreated.hasListeners()).toBe(true)` for each event.

- [ ] **Step 5: Commit**

```bash
git add src/entrypoints/background.ts src/entrypoints/background.test.ts
git commit -m "feat: sync bookmark index from background"
```

---

### Task 11: The dashboard audit view

**Files:**
- Create: `src/services/audit.ts`, `src/entrypoints/dashboard/index.html`, `src/entrypoints/dashboard/main.tsx`, `src/entrypoints/dashboard/App.tsx`, `src/entrypoints/dashboard/style.css`, `src/ui/components/SummaryCards.tsx`, `src/ui/components/DuplicateList.tsx`, `src/ui/components/PathList.tsx`
- Modify: `src/entrypoints/popup/App.tsx`, `docs/roadmap.md`
- Test: `src/ui/components/SummaryCards.test.tsx`, `src/ui/components/DuplicateList.test.tsx`

**Interfaces:**
- Consumes: `buildAuditReport`, `AuditReport` (Task 8), `getBookmarkTree` (Task 9), `DuplicateGroup` (Task 5), `FolderRecord`/`BookmarkRecord` (Task 4)
- Produces: `runAudit(): Promise<AuditReport>`, and the `dashboard.html` entrypoint

**This view is read-only.** No delete, no merge, no "clean up" button exists until Trash lands in Phase 2 (ADR 0006). The UI says so explicitly rather than leaving the user wondering.

- [ ] **Step 1: Install the test dependency**

```bash
pnpm add -D @testing-library/react @testing-library/dom
```

- [ ] **Step 2: Write the audit service**

`src/services/audit.ts`:

```ts
import { getBookmarkTree } from '@/adapters/bookmarks';
import { buildAuditReport, type AuditReport } from '@/core/bookmarks/audit';

/** Runs the offline audit against the live bookmark tree. */
export async function runAudit(): Promise<AuditReport> {
  return buildAuditReport(await getBookmarkTree());
}
```

- [ ] **Step 3: Write the failing component tests**

`src/ui/components/SummaryCards.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import SummaryCards from './SummaryCards';

describe('SummaryCards', () => {
  it('shows each headline number with its label', () => {
    render(
      <SummaryCards
        totalBookmarks={1204}
        redundantCount={37}
        emptyFolderCount={5}
        unscannableCount={2}
      />,
    );

    expect(screen.getByText('1204')).toBeTruthy();
    expect(screen.getByText('37')).toBeTruthy();
    expect(screen.getByText(/redundant copies/i)).toBeTruthy();
    expect(screen.getByText(/empty folders/i)).toBeTruthy();
  });
});
```

`src/ui/components/DuplicateList.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import DuplicateList from './DuplicateList';
import type { BookmarkRecord } from '@/shared/types';

function rec(id: string, title: string, path: string[]): BookmarkRecord {
  return {
    id, parentId: '1', path, index: 0, title,
    url: 'https://example.com/', normalizedUrl: 'https://example.com/',
    dateAdded: 1, scannable: true,
  };
}

describe('DuplicateList', () => {
  it('renders an empty state when there is nothing to show', () => {
    render(<DuplicateList groups={[]} />);
    expect(screen.getByText(/no duplicates/i)).toBeTruthy();
  });

  it('marks the keeper and lists the other copies with their folder path', () => {
    render(
      <DuplicateList
        groups={[
          {
            normalizedUrl: 'https://example.com/',
            keeper: rec('a', 'Example', ['Bookmarks bar']),
            duplicates: [rec('b', 'Example again', ['Bookmarks bar', 'Dev'])],
          },
        ]}
      />,
    );

    expect(screen.getByText('https://example.com/')).toBeTruthy();
    expect(screen.getByText(/keep/i)).toBeTruthy();
    expect(screen.getByText('Example again')).toBeTruthy();
    expect(screen.getByText('Bookmarks bar / Dev')).toBeTruthy();
  });
});
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `pnpm vitest run src/ui/components`
Expected: FAIL — cannot resolve `./SummaryCards` or `./DuplicateList`.

- [ ] **Step 5: Write the components**

`src/ui/components/SummaryCards.tsx`:

```tsx
interface Props {
  totalBookmarks: number;
  redundantCount: number;
  emptyFolderCount: number;
  unscannableCount: number;
}

const CARD = 'rounded-lg border border-slate-200 bg-white p-4';

export default function SummaryCards({
  totalBookmarks,
  redundantCount,
  emptyFolderCount,
  unscannableCount,
}: Props) {
  const cards: [number, string][] = [
    [totalBookmarks, 'bookmarks'],
    [redundantCount, 'redundant copies'],
    [emptyFolderCount, 'empty folders'],
    [unscannableCount, 'not checkable'],
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {cards.map(([value, label]) => (
        <div key={label} className={CARD}>
          <div className="text-2xl font-semibold tabular-nums text-slate-900">{value}</div>
          <div className="text-sm text-slate-500">{label}</div>
        </div>
      ))}
    </div>
  );
}
```

`src/ui/components/DuplicateList.tsx`:

```tsx
import type { DuplicateGroup } from '@/core/bookmarks/duplicates';

function formatPath(path: string[]): string {
  return path.length > 0 ? path.join(' / ') : '(top level)';
}

export default function DuplicateList({ groups }: { groups: DuplicateGroup[] }) {
  if (groups.length === 0) {
    return <p className="text-sm text-slate-500">No duplicates found.</p>;
  }

  return (
    <ul className="space-y-3">
      {groups.map((group) => (
        <li key={group.normalizedUrl} className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="truncate font-mono text-xs text-slate-500">{group.normalizedUrl}</p>
          <ul className="mt-2 space-y-1 text-sm">
            <li className="flex items-baseline gap-2">
              <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-xs text-emerald-800">keep</span>
              <span className="text-slate-900">{group.keeper.title}</span>
              <span className="text-slate-400">{formatPath(group.keeper.path)}</span>
            </li>
            {group.duplicates.map((duplicate) => (
              <li key={duplicate.id} className="flex items-baseline gap-2">
                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">copy</span>
                <span className="text-slate-900">{duplicate.title}</span>
                <span className="text-slate-400">{formatPath(duplicate.path)}</span>
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );
}
```

`src/ui/components/PathList.tsx`:

```tsx
export interface PathListItem {
  id: string;
  title: string;
  path: string[];
  detail?: string;
}

interface Props {
  items: PathListItem[];
  emptyMessage: string;
}

export default function PathList({ items, emptyMessage }: Props) {
  if (items.length === 0) {
    return <p className="text-sm text-slate-500">{emptyMessage}</p>;
  }

  return (
    <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
      {items.map((item) => (
        <li key={item.id} className="flex items-baseline gap-2 px-4 py-2 text-sm">
          <span className="text-slate-900">{item.title || '(untitled)'}</span>
          <span className="text-slate-400">
            {item.path.length > 0 ? item.path.join(' / ') : '(top level)'}
          </span>
          {item.detail !== undefined && (
            <span className="ml-auto truncate font-mono text-xs text-slate-400">{item.detail}</span>
          )}
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 6: Run the component tests to verify they pass**

Run: `pnpm vitest run src/ui/components`
Expected: PASS, 3 tests.

- [ ] **Step 7: Write the dashboard entrypoint**

`src/entrypoints/dashboard/index.html`:

```html
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Bookmark audit — Smart Bookmark Cleaner</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./main.tsx"></script>
  </body>
</html>
```

`src/entrypoints/dashboard/style.css`:

```css
@import "tailwindcss";
```

`src/entrypoints/dashboard/main.tsx`:

```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './style.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
```

`src/entrypoints/dashboard/App.tsx`:

```tsx
import { useEffect, useState } from 'react';
import type { AuditReport } from '@/core/bookmarks/audit';
import { runAudit } from '@/services/audit';
import SummaryCards from '@/ui/components/SummaryCards';
import DuplicateList from '@/ui/components/DuplicateList';
import PathList from '@/ui/components/PathList';

type State =
  | { status: 'loading' }
  | { status: 'ready'; report: AuditReport }
  | { status: 'error'; message: string };

export default function App() {
  const [state, setState] = useState<State>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    runAudit().then(
      (report) => { if (!cancelled) setState({ status: 'ready', report }); },
      (error: unknown) => {
        if (cancelled) return;
        setState({
          status: 'error',
          message: error instanceof Error ? error.message : String(error),
        });
      },
    );
    return () => { cancelled = true; };
  }, []);

  return (
    <main className="mx-auto min-h-screen max-w-4xl bg-slate-50 p-8 text-slate-900">
      <h1 className="text-xl font-semibold">Bookmark audit</h1>
      <p className="mt-1 text-sm text-slate-500">
        Read-only for now — cleanup actions arrive once Trash and undo are in place.
      </p>

      {state.status === 'loading' && <p className="mt-8 text-sm text-slate-500">Reading your bookmarks…</p>}

      {state.status === 'error' && (
        <p className="mt-8 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          Could not read your bookmarks: {state.message}
        </p>
      )}

      {state.status === 'ready' && (
        <div className="mt-6 space-y-8">
          <SummaryCards
            totalBookmarks={state.report.totalBookmarks}
            redundantCount={state.report.redundantCount}
            emptyFolderCount={state.report.emptyFolders.length}
            unscannableCount={state.report.unscannable.length}
          />

          <section>
            <h2 className="mb-3 text-base font-semibold">Duplicates</h2>
            <DuplicateList groups={state.report.duplicateGroups} />
          </section>

          <section>
            <h2 className="mb-3 text-base font-semibold">Empty folders</h2>
            <PathList
              items={state.report.emptyFolders.map((f) => ({ id: f.id, title: f.title, path: f.path }))}
              emptyMessage="No empty folders."
            />
          </section>

          <section>
            <h2 className="mb-3 text-base font-semibold">Not checkable</h2>
            <p className="mb-3 text-sm text-slate-500">
              Bookmarklets, local files, and intranet addresses. The link scanner will skip these.
            </p>
            <PathList
              items={state.report.unscannable.map((b) => ({
                id: b.id, title: b.title, path: b.path, detail: b.url,
              }))}
              emptyMessage="Nothing skipped."
            />
          </section>
        </div>
      )}
    </main>
  );
}
```

- [ ] **Step 8: Point the popup at the dashboard**

Replace `src/entrypoints/popup/App.tsx` with:

```tsx
import { browser } from 'wxt/browser';

export default function App() {
  const open = () => {
    void browser.tabs.create({ url: browser.runtime.getURL('/dashboard.html') });
    window.close();
  };

  return (
    <main className="w-72 p-4">
      <h1 className="text-base font-semibold text-slate-900">Smart Bookmark Cleaner</h1>
      <p className="mt-1 text-sm text-slate-500">
        Find duplicates, empty folders, and entries the scanner cannot check.
      </p>
      <button
        type="button"
        onClick={open}
        className="mt-4 w-full rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700"
      >
        Open audit
      </button>
    </main>
  );
}
```

- [ ] **Step 9: Verify the whole build**

```bash
pnpm typecheck && pnpm test && pnpm build
```

Then load `.output/chrome-mv3` via `chrome://extensions` → Load unpacked, open the popup, and click **Open audit**. On a real profile confirm: the counts are plausible, a known duplicate appears in the list, and no delete control exists anywhere.

- [ ] **Step 10: Update the roadmap to match what was built**

In `docs/roadmap.md`, replace this Phase 0 line:

```
3. Shared types and typed message bus — `feat: add shared types and message bus`
```

with:

```
3. Shared domain types — introduced alongside their first consumer in Task 4
```

and insert this line into Phase 3, directly above the "Background orchestration" item:

```
19b. Typed message bus between dashboard and background — `feat: add typed message bus`
```

The bus was deferred because the Phase 1 dashboard reads the bookmark tree directly; nothing needed it yet.

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "feat: add dashboard audit view"
```

---

## Definition of done

Phase 0–1 is complete when all of the following hold:

- `pnpm typecheck && pnpm test && pnpm build` is clean.
- The unpacked build loads in Chrome, the popup opens the dashboard, and the audit renders against a real profile.
- The manifest requests exactly `["bookmarks", "storage"]` — verify in `.output/chrome-mv3/manifest.json`.
- Nothing in `src/core/**` imports `wxt/browser` — verify with
  `grep -rn "wxt/browser" src/core || echo clean`.
- No delete, merge, or cleanup control exists in the UI.
- Every task above was committed separately, in order.

Next phase: Trash and undo (roadmap items 11–13), which must land before any destructive action or scan verdict reaches the UI.
