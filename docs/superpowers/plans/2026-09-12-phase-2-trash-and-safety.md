# Phase 2: Trash and Safety — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every destructive path reversible — soft-delete into a restorable Trash, a downloadable JSON backup, and guarded bulk actions — so that the dead-link scanner of Phase 3 can never cause unrecoverable loss.

**Architecture:** Phase 1 upheld "never auto-delete" structurally: `src/adapters/bookmarks.ts` exposed only `getBookmarkTree`, so no code path existed that *could* delete a bookmark. This phase necessarily ends that, and replaces it with a narrower guarantee: mutation lives behind a single chokepoint, `src/services/trash.ts`, which cannot remove a bookmark without first durably recording how to put it back. The pure decision logic — which folders a restore must recreate, which entries have expired — stays in `src/core/trash/**` and is tested without a browser.

**Tech Stack:** WXT 0.21.4 · React 19 · TypeScript strict · Tailwind CSS v4 · `idb` · Vitest + `fake-indexeddb` + `@testing-library/react`

**Spec:** [`docs/superpowers/specs/2026-09-10-bookmark-cleaner-design.md`](../specs/2026-09-10-bookmark-cleaner-design.md) §5.4, and [`docs/adr/0006-never-auto-delete.md`](../../adr/0006-never-auto-delete.md)

## Global Constraints

- **Nothing is deleted without an explicit user action.** No automatic cleanup, no "clean all" button, no setting that enables one. ADR 0006 is not negotiable and requests for an auto-clean mode are answered with it.
- **`src/services/trash.ts` is the only module that may call a mutating browser bookmark API.** Every other module — UI, services, core — routes through it. Task 4 adds a test that fails if a mutating adapter function is imported anywhere else.
- **A removal writes its Trash entry before it removes anything.** If the write fails, the removal does not happen. Never the other way round.
- `src/core/**` stays pure: no `#imports`, no `chrome.*`, no `fetch`, no clock reads. The clock arrives as an argument (`now: number`).
- `src/adapters/**` is thin wrappers only; `src/services/**` is composition.
- Manifest permissions stay exactly `["bookmarks", "storage"]`. The JSON backup downloads via an object URL and an anchor from an extension page, which needs no `downloads` permission. Retention sweeps run on worker startup and on dashboard open, which needs no `alarms` permission.
- TypeScript `strict` with `noUncheckedIndexedAccess`. No `any`.
- Tests colocated: `foo.ts` → `foo.test.ts`. Write the test first for everything in `src/core/**`.
- Never log URLs, titles, or bookmark content.
- Commit each task separately. English, imperative, under ~60 chars, no trailing period, with the project's `Co-Authored-By` trailer.

## Design decisions this plan makes

**Restore targets folders by name, not by id.** A Trash entry stores `parentPath` as folder *names*, because the original parent may have been deleted since. Restore walks that path from the root, reusing an existing folder when one of that name exists at that level and creating one when it does not. Two sibling folders sharing a name is possible; the rule is **first match wins**, and it is recorded in the restore plan so the UI can say where the bookmark went.

**The auto-backup is stored, not downloaded.** §5.4 says a backup is written before any bulk operation and is "downloadable from settings". Downloading a file automatically before every bulk action would be intrusive and would train users to ignore it. Instead the snapshot goes into a `backups` object store (the last three are kept) and the settings page offers each for download.

**Retention sweeps opportunistically.** Expired entries are removed when the background worker starts and when the dashboard opens — both moments where the cost is invisible. This avoids the `alarms` permission for a 30-day deadline where a few hours' delay is meaningless. A user who never opens the extension keeps their trash, which is the safe failure direction.

## File Structure

| File | Responsibility |
|---|---|
| `src/shared/types.ts` | extend with `TrashEntry`, `BackupSnapshot` |
| `src/core/trash/restore-plan.ts` | pure: Trash entry + live folders → the folders to create and the parent to insert into |
| `src/core/trash/retention.ts` | pure: which entries have expired, given `now` |
| `src/core/backup/serialize.ts` | pure: bookmark tree → the backup JSON payload |
| `src/adapters/bookmarks.ts` | add `createFolder`, `createBookmark`, `removeBookmark` |
| `src/adapters/db.ts` | v2 migration; trash and backups CRUD |
| `src/adapters/download.ts` | object-URL download of a JSON payload |
| `src/services/trash.ts` | the chokepoint: `softDeleteBookmarks`, `restoreFromTrash`, `sweepExpiredTrash` |
| `src/services/backup.ts` | snapshot the tree, store it, download one |
| `src/ui/components/TrashList.tsx` | trash entries with a Restore action |
| `src/ui/components/ConfirmDialog.tsx` | count-bearing confirmation for a bulk action |
| `src/ui/components/DuplicateList.tsx` | gains selection checkboxes |
| `src/entrypoints/dashboard/App.tsx` | gains a Trash section and the bulk-action flow |

---

### Task 1: Trash and backup types, and the v2 database

**Files:**
- Modify: `src/shared/types.ts`, `src/adapters/db.ts`
- Test: `src/adapters/db.test.ts`

**Interfaces:**
- Consumes: `BookmarkRecord` (existing)
- Produces: types `TrashEntry`, `BackupSnapshot`; `DB_VERSION = 2`; `putTrashEntries`, `getAllTrashEntries`, `deleteTrashEntries`, `putBackup`, `getAllBackups`, `deleteBackup`

The existing database is version 1 with a single `bookmarks` store. This adds two stores behind a version bump, so an installed extension migrates rather than losing its index.

- [ ] **Step 1: Add the types**

In `src/shared/types.ts`:

```ts
/** A soft-deleted bookmark, carrying everything needed to put it back. */
export interface TrashEntry {
  trashId: string;
  title: string;
  url: string;
  /** Enclosing folder names, outermost first — names, not ids, because the original parent may be gone. */
  parentPath: string[];
  /** Position within the original parent. Best effort: the folder may have changed since. */
  index: number;
  deletedAt: number;
  reason: 'duplicate' | 'manual';
}

/** A point-in-time copy of the whole bookmark tree, written before a bulk action. */
export interface BackupSnapshot {
  backupId: string;
  createdAt: number;
  /** Why it was taken, e.g. "before removing 37 duplicates". Never contains a URL or title. */
  note: string;
  bookmarkCount: number;
  /** The serialized tree. Stored as a string so the payload shape can evolve independently of the schema. */
  payload: string;
}
```

`reason` omits `'dead-link'`, which arrives with Phase 3.

- [ ] **Step 2: Write the failing test**

Add to `src/adapters/db.test.ts`:

```ts
import type { TrashEntry, BackupSnapshot } from '@/shared/types';
import {
  putTrashEntries, getAllTrashEntries, deleteTrashEntries,
  putBackup, getAllBackups, deleteBackup,
} from './db';

function trash(id: string, deletedAt = 1): TrashEntry {
  return {
    trashId: id, title: id, url: `https://${id}.test/`,
    parentPath: ['Bookmarks bar'], index: 0, deletedAt, reason: 'manual',
  };
}

describe('trash store', () => {
  beforeEach(async () => { resetDbConnection(); await deleteDB(DB_NAME); });

  it('starts empty', async () => {
    expect(await getAllTrashEntries()).toEqual([]);
  });

  it('stores and reads entries back', async () => {
    await putTrashEntries([trash('a'), trash('b')]);
    expect((await getAllTrashEntries()).map((e) => e.trashId).sort()).toEqual(['a', 'b']);
  });

  it('deletes entries by id', async () => {
    await putTrashEntries([trash('a'), trash('b')]);
    await deleteTrashEntries(['a']);
    expect((await getAllTrashEntries()).map((e) => e.trashId)).toEqual(['b']);
  });
});

describe('backups store', () => {
  beforeEach(async () => { resetDbConnection(); await deleteDB(DB_NAME); });

  it('stores, lists newest first, and deletes', async () => {
    const snap = (id: string, createdAt: number): BackupSnapshot => ({
      backupId: id, createdAt, note: 'test', bookmarkCount: 1, payload: '[]',
    });
    await putBackup(snap('old', 100));
    await putBackup(snap('new', 200));
    expect((await getAllBackups()).map((b) => b.backupId)).toEqual(['new', 'old']);
    await deleteBackup('old');
    expect((await getAllBackups()).map((b) => b.backupId)).toEqual(['new']);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `pnpm vitest run src/adapters/db.test.ts`
Expected: FAIL — the new exports do not exist.

- [ ] **Step 4: Extend the schema and add the accessors**

In `src/adapters/db.ts`, extend `SbcSchema` and bump the version. The `upgrade` callback receives `oldVersion`; create only what is missing so an installed v1 database keeps its `bookmarks` store and its contents.

```ts
export interface SbcSchema extends DBSchema {
  bookmarks: {
    key: string;
    value: BookmarkRecord;
    indexes: { 'by-normalized-url': string };
  };
  trash: {
    key: string;
    value: TrashEntry;
    indexes: { 'by-deleted-at': number };
  };
  backups: {
    key: string;
    value: BackupSnapshot;
    indexes: { 'by-created-at': number };
  };
}

export const DB_VERSION = 2;
```

In `upgrade(db, oldVersion)`:

```ts
if (oldVersion < 1) {
  const bookmarks = db.createObjectStore('bookmarks', { keyPath: 'id' });
  bookmarks.createIndex('by-normalized-url', 'normalizedUrl');
}
if (oldVersion < 2) {
  const trash = db.createObjectStore('trash', { keyPath: 'trashId' });
  trash.createIndex('by-deleted-at', 'deletedAt');
  const backups = db.createObjectStore('backups', { keyPath: 'backupId' });
  backups.createIndex('by-created-at', 'createdAt');
}
```

Then the accessors, each in one transaction:

```ts
export async function putTrashEntries(entries: TrashEntry[]): Promise<void> {
  const db = await getDb();
  const tx = db.transaction('trash', 'readwrite');
  await Promise.all(entries.map((e) => tx.store.put(e)));
  await tx.done;
}

export async function getAllTrashEntries(): Promise<TrashEntry[]> {
  return (await getDb()).getAll('trash');
}

export async function deleteTrashEntries(trashIds: string[]): Promise<void> {
  const db = await getDb();
  const tx = db.transaction('trash', 'readwrite');
  await Promise.all(trashIds.map((id) => tx.store.delete(id)));
  await tx.done;
}

export async function putBackup(snapshot: BackupSnapshot): Promise<void> {
  await (await getDb()).put('backups', snapshot);
}

/** Newest first. */
export async function getAllBackups(): Promise<BackupSnapshot[]> {
  const all = await (await getDb()).getAllFromIndex('backups', 'by-created-at');
  return all.reverse();
}

export async function deleteBackup(backupId: string): Promise<void> {
  await (await getDb()).delete('backups', backupId);
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm vitest run src/adapters/db.test.ts`
Expected: PASS, including the three pre-existing bookmark tests.

- [ ] **Step 6: Add a migration test**

The v1→v2 path is the one thing a fresh-database test cannot cover, and getting it wrong loses a user's index. Add:

```ts
it('preserves the bookmarks store when migrating v1 to v2', async () => {
  resetDbConnection();
  await deleteDB(DB_NAME);

  // open at v1 with only the bookmarks store, as shipped in Phase 1
  const v1 = await openDB(DB_NAME, 1, {
    upgrade(db) {
      const s = db.createObjectStore('bookmarks', { keyPath: 'id' });
      s.createIndex('by-normalized-url', 'normalizedUrl');
    },
  });
  await v1.put('bookmarks', rec('survivor'));
  v1.close();
  resetDbConnection();

  expect((await getAllBookmarks()).map((r) => r.id)).toEqual(['survivor']);
  expect(await getAllTrashEntries()).toEqual([]);
});
```

`openDB` needs importing from `idb` in the test file.

- [ ] **Step 7: Run the tests and commit**

Run: `pnpm vitest run src/adapters/db.test.ts && pnpm typecheck`

```bash
git add src/shared/types.ts src/adapters/db.ts src/adapters/db.test.ts
git commit -m "feat: add trash and backup stores"
```

---

### Task 2: Restore planning

**Files:**
- Create: `src/core/trash/restore-plan.ts`
- Test: `src/core/trash/restore-plan.test.ts`

**Interfaces:**
- Consumes: `TrashEntry` (Task 1), `FolderRecord` (existing)
- Produces: type `RestorePlan`; function `planRestore(entry: TrashEntry, folders: FolderRecord[]): RestorePlan`

A Trash entry names its original location by folder *names*, because ids do not survive the folder being deleted. This pure function works out, against the folders that exist right now, which ones must be created and which existing folder the bookmark finally lands in. It creates nothing — it only decides.

The rule when two sibling folders share a name is **first match wins**, and the plan reports the resolved path so the UI can tell the user where the bookmark went.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { planRestore } from './restore-plan';
import type { FolderRecord, TrashEntry } from '@/shared/types';

function folder(id: string, title: string, path: string[], parentId: string): FolderRecord {
  return { id, parentId, path, title, depth: path.length + 1, isProtected: path.length === 0 };
}

function entry(parentPath: string[]): TrashEntry {
  return {
    trashId: 't1', title: 'Example', url: 'https://example.com/',
    parentPath, index: 2, deletedAt: 1, reason: 'manual',
  };
}

const bar = folder('1', 'Bookmarks bar', [], '0');
const dev = folder('11', 'Dev', ['Bookmarks bar'], '1');

describe('planRestore', () => {
  it('targets an existing folder directly when the whole path survives', () => {
    const plan = planRestore(entry(['Bookmarks bar', 'Dev']), [bar, dev]);
    expect(plan.foldersToCreate).toEqual([]);
    expect(plan.existingParentId).toBe('11');
    expect(plan.resolvedPath).toEqual(['Bookmarks bar', 'Dev']);
  });

  it('plans the missing tail of a partially surviving path', () => {
    const plan = planRestore(entry(['Bookmarks bar', 'Dev', 'Rust']), [bar, dev]);
    expect(plan.existingParentId).toBe('11');
    expect(plan.foldersToCreate).toEqual(['Rust']);
    expect(plan.resolvedPath).toEqual(['Bookmarks bar', 'Dev', 'Rust']);
  });

  it('plans every level when only the root survives', () => {
    const plan = planRestore(entry(['Bookmarks bar', 'Gone', 'Deeper']), [bar]);
    expect(plan.existingParentId).toBe('1');
    expect(plan.foldersToCreate).toEqual(['Gone', 'Deeper']);
  });

  it('falls back to the first root folder when even that is unrecognised', () => {
    const plan = planRestore(entry(['Vanished']), [bar]);
    expect(plan.existingParentId).toBe('1');
    expect(plan.foldersToCreate).toEqual(['Vanished']);
    expect(plan.relocated).toBe(true);
  });

  it('takes the first match when two siblings share a name', () => {
    const dupA = folder('20', 'Dev', ['Bookmarks bar'], '1');
    const dupB = folder('21', 'Dev', ['Bookmarks bar'], '1');
    expect(planRestore(entry(['Bookmarks bar', 'Dev']), [bar, dupA, dupB]).existingParentId).toBe('20');
  });

  it('restores to the top level when the entry had no folder path', () => {
    const plan = planRestore(entry([]), [bar]);
    expect(plan.existingParentId).toBe('1');
    expect(plan.foldersToCreate).toEqual([]);
    expect(plan.relocated).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run src/core/trash/restore-plan.test.ts`
Expected: FAIL — cannot resolve `./restore-plan`.

- [ ] **Step 3: Write the implementation**

```ts
import type { FolderRecord, TrashEntry } from '@/shared/types';

export interface RestorePlan {
  /** The deepest surviving folder the restore can attach to. */
  existingParentId: string;
  /** Folder names to create beneath it, outermost first. */
  foldersToCreate: string[];
  /** Where the bookmark will end up, for the UI to report. */
  resolvedPath: string[];
  /** True when the original path's own root no longer exists and a fallback root was chosen. */
  relocated: boolean;
  index: number;
}

/**
 * Decides where a trashed bookmark goes back to, against the folders that exist
 * now. Creates nothing. When two sibling folders share a name, the first wins.
 */
export function planRestore(entry: TrashEntry, folders: FolderRecord[]): RestorePlan {
  const roots = folders.filter((f) => f.path.length === 0);
  const fallbackRoot = roots[0];
  if (!fallbackRoot) {
    throw new Error('cannot plan a restore with no root folder');
  }

  if (entry.parentPath.length === 0) {
    return {
      existingParentId: fallbackRoot.id,
      foldersToCreate: [],
      resolvedPath: [fallbackRoot.title],
      relocated: false,
      index: entry.index,
    };
  }

  const [rootName, ...rest] = entry.parentPath;
  const root = roots.find((f) => f.title === rootName);
  if (!root) {
    return {
      existingParentId: fallbackRoot.id,
      foldersToCreate: entry.parentPath,
      resolvedPath: [fallbackRoot.title, ...entry.parentPath],
      relocated: true,
      index: entry.index,
    };
  }

  let parentId = root.id;
  let i = 0;
  for (; i < rest.length; i += 1) {
    const name = rest[i]!;
    const match = folders.find((f) => f.parentId === parentId && f.title === name);
    if (!match) break;
    parentId = match.id;
  }

  return {
    existingParentId: parentId,
    foldersToCreate: rest.slice(i),
    resolvedPath: entry.parentPath,
    relocated: false,
    index: entry.index,
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run src/core/trash/restore-plan.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/core/trash/restore-plan.ts src/core/trash/restore-plan.test.ts
git commit -m "feat: plan bookmark restores by folder name"
```

---

### Task 3: Retention

**Files:**
- Create: `src/core/trash/retention.ts`
- Test: `src/core/trash/retention.test.ts`

**Interfaces:**
- Consumes: `TrashEntry` (Task 1)
- Produces: `RETENTION_DAYS`, `findExpiredEntries(entries: TrashEntry[], now: number): string[]`

Pure, and the clock arrives as an argument so the boundary is testable without faking time.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { findExpiredEntries, RETENTION_DAYS } from './retention';
import type { TrashEntry } from '@/shared/types';

const DAY = 24 * 60 * 60 * 1000;
const NOW = 1_000_000_000_000;

function entry(trashId: string, ageDays: number): TrashEntry {
  return {
    trashId, title: trashId, url: `https://${trashId}.test/`,
    parentPath: [], index: 0, deletedAt: NOW - ageDays * DAY, reason: 'manual',
  };
}

describe('findExpiredEntries', () => {
  it('keeps everything inside the window', () => {
    expect(findExpiredEntries([entry('a', 1), entry('b', 29)], NOW)).toEqual([]);
  });

  it('expires entries past the window', () => {
    expect(findExpiredEntries([entry('a', 31), entry('b', 1)], NOW)).toEqual(['a']);
  });

  it('keeps an entry exactly on the boundary', () => {
    expect(findExpiredEntries([entry('edge', RETENTION_DAYS)], NOW)).toEqual([]);
  });

  it('ignores an entry deleted in the future rather than expiring it', () => {
    expect(findExpiredEntries([entry('clockskew', -5)], NOW)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run src/core/trash/retention.test.ts`
Expected: FAIL — cannot resolve `./retention`.

- [ ] **Step 3: Write the implementation**

```ts
import type { TrashEntry } from '@/shared/types';

export const RETENTION_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Ids of entries older than the retention window. `now` is passed in so the
 * boundary is testable and this module stays free of the clock.
 */
export function findExpiredEntries(entries: TrashEntry[], now: number): string[] {
  const cutoff = now - RETENTION_DAYS * DAY_MS;
  return entries.filter((e) => e.deletedAt < cutoff).map((e) => e.trashId);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run src/core/trash/retention.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/core/trash/retention.ts src/core/trash/retention.test.ts
git commit -m "feat: expire trash entries after 30 days"
```

---

### Task 4: Mutating adapters, and the containment rule

**Files:**
- Modify: `src/adapters/bookmarks.ts`
- Test: `src/adapters/bookmarks.test.ts`, `src/architecture.test.ts`

**Interfaces:**
- Produces: `createFolder(parentId, title)`, `createBookmark({parentId, title, url, index})`, `removeBookmark(id)`

**This is the most consequential task in the plan.** Phase 1's final review observed that "never auto-delete" was enforced by there being no code that could break it — `getBookmarkTree` was the entire adapter. Adding removal ends that, so this task replaces the structural guarantee with a narrower one and *tests* it: these functions may be imported by `src/services/trash.ts` and nowhere else.

- [ ] **Step 1: Write the failing containment test**

Create `src/architecture.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const MUTATORS = ['createFolder', 'createBookmark', 'removeBookmark'];
const ALLOWED = ['src/services/trash.ts', 'src/adapters/bookmarks.ts'];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [full] : [];
  });
}

describe('mutation containment', () => {
  it('only the trash service imports a mutating bookmark adapter', () => {
    const offenders = sourceFiles('src')
      .filter((f) => !ALLOWED.some((a) => f.endsWith(a.replace('src/', ''))))
      .filter((f) => {
        const text = readFileSync(f, 'utf8');
        return MUTATORS.some((m) => new RegExp(`\\b${m}\\b`).test(text));
      });
    expect(offenders).toEqual([]);
  });
});
```

The `ALLOWED` suffix match keeps the test working regardless of how the runner resolves the working directory.

- [ ] **Step 2: Run it to verify it passes trivially, then verify it can fail**

Run: `pnpm vitest run src/architecture.test.ts`
Expected: PASS — nothing references the mutators yet.

A test that cannot fail is worthless, so prove it can: temporarily add `// createBookmark` to `src/services/audit.ts`, re-run, see the test fail naming that file, then remove the line. Record both outputs in your report.

- [ ] **Step 3: Write the adapter functions**

Append to `src/adapters/bookmarks.ts`:

```ts
/**
 * Mutating wrappers. Every caller must go through `src/services/trash.ts`,
 * which cannot remove a bookmark without first recording how to restore it.
 * `src/architecture.test.ts` enforces that; do not widen its allowlist without
 * reading ADR 0006 first.
 */
export async function createFolder(parentId: string, title: string): Promise<string> {
  const node = await browser.bookmarks.create({ parentId, title });
  return node.id;
}

export async function createBookmark(input: {
  parentId: string;
  title: string;
  url: string;
  index?: number;
}): Promise<string> {
  const node = await browser.bookmarks.create(input);
  return node.id;
}

export async function removeBookmark(id: string): Promise<void> {
  await browser.bookmarks.remove(id);
}
```

- [ ] **Step 4: Write the adapter test**

`src/adapters/bookmarks.test.ts` — `@webext-core/fake-browser` does not implement `bookmarks.create`/`remove`, so spy on the module's `browser` binding the way `background.test.ts` does for events, and assert each wrapper forwards its arguments and returns the new id.

```ts
import { describe, expect, it, vi } from 'vitest';
import { browser } from '#imports';
import { createBookmark, createFolder, removeBookmark } from './bookmarks';

describe('mutating bookmark adapters', () => {
  it('creates a folder and returns its id', async () => {
    const create = vi.spyOn(browser.bookmarks, 'create').mockResolvedValue({ id: 'new', title: 'Dev' } as never);
    await expect(createFolder('1', 'Dev')).resolves.toBe('new');
    expect(create).toHaveBeenCalledWith({ parentId: '1', title: 'Dev' });
  });

  it('creates a bookmark with its position', async () => {
    const create = vi.spyOn(browser.bookmarks, 'create').mockResolvedValue({ id: 'b1' } as never);
    await expect(createBookmark({ parentId: '1', title: 'X', url: 'https://x.test/', index: 2 })).resolves.toBe('b1');
    expect(create).toHaveBeenCalledWith({ parentId: '1', title: 'X', url: 'https://x.test/', index: 2 });
  });

  it('removes by id', async () => {
    const remove = vi.spyOn(browser.bookmarks, 'remove').mockResolvedValue(undefined as never);
    await removeBookmark('b1');
    expect(remove).toHaveBeenCalledWith('b1');
  });
});
```

If `vi.spyOn` cannot attach because the fake browser throws on property access for unimplemented namespaces, report what you observed rather than working around it — the containment test is the load-bearing one here, and a thin forwarding wrapper is acceptable to leave untested if the harness genuinely cannot reach it.

- [ ] **Step 5: Run both tests and commit**

Run: `pnpm vitest run src/adapters src/architecture.test.ts && pnpm typecheck`

```bash
git add src/adapters/bookmarks.ts src/adapters/bookmarks.test.ts src/architecture.test.ts
git commit -m "feat: add mutating bookmark adapters behind a guard"
```

---

### Task 5: The trash service — the chokepoint

**Files:**
- Create: `src/services/trash.ts`
- Test: `src/services/trash.test.ts`

**Interfaces:**
- Consumes: `planRestore` (Task 2), `findExpiredEntries` (Task 3), the mutating adapters (Task 4), the trash accessors (Task 1), `flattenTree` and `getBookmarkTree` (existing)
- Produces: `softDeleteBookmarks(records: BookmarkRecord[], reason: TrashEntry['reason']): Promise<TrashEntry[]>`, `restoreFromTrash(trashId: string): Promise<RestorePlan>`, `sweepExpiredTrash(now?: number): Promise<string[]>`

This module is the whole safety guarantee. The ordering inside `softDeleteBookmarks` is the point: **the trash entries are written and durable before a single bookmark is removed.** A crash between the two leaves a recoverable orphan entry, which is harmless; the reverse order would lose data.

- [ ] **Step 1: Write the failing test**

```ts
import 'fake-indexeddb/auto';
import { deleteDB } from 'idb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BookmarkNode, BookmarkRecord } from '@/shared/types';

const getBookmarkTree = vi.fn<() => Promise<BookmarkNode[]>>();
const removeBookmark = vi.fn<(id: string) => Promise<void>>();
const createFolder = vi.fn<(parentId: string, title: string) => Promise<string>>();
const createBookmark = vi.fn<(i: unknown) => Promise<string>>();

vi.mock('@/adapters/bookmarks', () => ({
  getBookmarkTree: () => getBookmarkTree(),
  removeBookmark: (id: string) => removeBookmark(id),
  createFolder: (p: string, t: string) => createFolder(p, t),
  createBookmark: (i: unknown) => createBookmark(i),
}));

const { softDeleteBookmarks, restoreFromTrash, sweepExpiredTrash } = await import('./trash');
const { getAllTrashEntries, putTrashEntries, resetDbConnection, DB_NAME } = await import('@/adapters/db');

const tree: BookmarkNode[] = [{
  id: '0', title: '', children: [{
    id: '1', parentId: '0', title: 'Bookmarks bar', children: [
      { id: '10', parentId: '1', index: 0, title: 'Example', url: 'https://example.com/', dateAdded: 1 },
    ],
  }],
}];

function rec(id: string): BookmarkRecord {
  return {
    id, parentId: '1', path: ['Bookmarks bar'], index: 0, title: id,
    url: `https://${id}.test/`, normalizedUrl: `https://${id}.test/`, dateAdded: 1, scannable: true,
  };
}

describe('trash service', () => {
  beforeEach(async () => {
    resetDbConnection();
    await deleteDB(DB_NAME);
    vi.clearAllMocks();
    getBookmarkTree.mockResolvedValue(tree);
    removeBookmark.mockResolvedValue();
  });

  it('has the trash entry durably stored at the moment it removes the bookmark', async () => {
    // The guarantee this whole phase exists for. Asserting the entry is present
    // AFTER the call would pass even if the order were reversed, so read the
    // store from inside the removal itself.
    let storedAtRemoval: Awaited<ReturnType<typeof getAllTrashEntries>> = [];
    removeBookmark.mockImplementation(async () => {
      storedAtRemoval = await getAllTrashEntries();
    });

    await softDeleteBookmarks([rec('a')], 'duplicate');

    expect(storedAtRemoval).toHaveLength(1);
    expect(storedAtRemoval[0]).toMatchObject({
      title: 'a', parentPath: ['Bookmarks bar'], reason: 'duplicate',
    });
  });

  it('removes nothing when the trash write fails', async () => {
    // Force the write to fail by closing the database out from under it.
    resetDbConnection();
    const { getDb } = await import('@/adapters/db');
    (await getDb()).close();

    await expect(softDeleteBookmarks([rec('a')], 'manual')).rejects.toThrow();
    expect(removeBookmark).not.toHaveBeenCalled();
  });

  it('restores into an existing folder without creating one', async () => {
    createBookmark.mockResolvedValue('new-id');
    await putTrashEntries([{
      trashId: 't1', title: 'Example', url: 'https://example.com/',
      parentPath: ['Bookmarks bar'], index: 0, deletedAt: 1, reason: 'manual',
    }]);

    const plan = await restoreFromTrash('t1');

    expect(createFolder).not.toHaveBeenCalled();
    expect(createBookmark).toHaveBeenCalledWith({
      parentId: '1', title: 'Example', url: 'https://example.com/', index: 0,
    });
    expect(plan.resolvedPath).toEqual(['Bookmarks bar']);
    expect(await getAllTrashEntries()).toEqual([]);
  });

  it('recreates a missing folder on the way back', async () => {
    createFolder.mockResolvedValue('made');
    createBookmark.mockResolvedValue('new-id');
    await putTrashEntries([{
      trashId: 't2', title: 'Example', url: 'https://example.com/',
      parentPath: ['Bookmarks bar', 'Gone'], index: 0, deletedAt: 1, reason: 'manual',
    }]);

    await restoreFromTrash('t2');

    expect(createFolder).toHaveBeenCalledWith('1', 'Gone');
    expect(createBookmark).toHaveBeenCalledWith(expect.objectContaining({ parentId: 'made' }));
  });

  it('keeps the trash entry when the restore itself fails', async () => {
    createBookmark.mockRejectedValue(new Error('nope'));
    await putTrashEntries([{
      trashId: 't3', title: 'Example', url: 'https://example.com/',
      parentPath: ['Bookmarks bar'], index: 0, deletedAt: 1, reason: 'manual',
    }]);

    await expect(restoreFromTrash('t3')).rejects.toThrow('nope');
    expect(await getAllTrashEntries()).toHaveLength(1);
  });

  it('sweeps only expired entries', async () => {
    const DAY = 24 * 60 * 60 * 1000;
    const now = 1_000_000_000_000;
    await putTrashEntries([
      { trashId: 'old', title: 'o', url: 'https://o.test/', parentPath: [], index: 0, deletedAt: now - 31 * DAY, reason: 'manual' },
      { trashId: 'new', title: 'n', url: 'https://n.test/', parentPath: [], index: 0, deletedAt: now - 1 * DAY, reason: 'manual' },
    ]);

    expect(await sweepExpiredTrash(now)).toEqual(['old']);
    expect((await getAllTrashEntries()).map((e) => e.trashId)).toEqual(['new']);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run src/services/trash.test.ts`
Expected: FAIL — cannot resolve `./trash`.

- [ ] **Step 3: Write the implementation**

```ts
import { createBookmark, createFolder, getBookmarkTree, removeBookmark } from '@/adapters/bookmarks';
import { deleteTrashEntries, getAllTrashEntries, putTrashEntries } from '@/adapters/db';
import { flattenTree } from '@/core/bookmarks/flatten';
import { planRestore, type RestorePlan } from '@/core/trash/restore-plan';
import { findExpiredEntries } from '@/core/trash/retention';
import type { BookmarkRecord, TrashEntry } from '@/shared/types';

/**
 * The only place in this codebase that removes or creates a bookmark.
 * `src/architecture.test.ts` enforces that; see ADR 0006 before widening it.
 */

function toTrashEntry(record: BookmarkRecord, reason: TrashEntry['reason'], now: number): TrashEntry {
  return {
    trashId: `${record.id}-${now}-${Math.random().toString(36).slice(2, 8)}`,
    title: record.title,
    url: record.url,
    parentPath: record.path,
    index: record.index,
    deletedAt: now,
    reason,
  };
}

/**
 * Soft-deletes bookmarks. The trash entries are written and durable BEFORE
 * anything is removed: a crash in between leaves a recoverable orphan entry,
 * whereas the reverse order would lose the bookmark outright.
 */
export async function softDeleteBookmarks(
  records: BookmarkRecord[],
  reason: TrashEntry['reason'],
): Promise<TrashEntry[]> {
  if (records.length === 0) return [];

  const now = Date.now();
  const entries = records.map((r) => toTrashEntry(r, reason, now));
  await putTrashEntries(entries);

  for (const record of records) {
    await removeBookmark(record.id);
  }
  return entries;
}

/** Puts a trashed bookmark back, recreating any folders its path has lost. */
export async function restoreFromTrash(trashId: string): Promise<RestorePlan> {
  const entry = (await getAllTrashEntries()).find((e) => e.trashId === trashId);
  if (!entry) throw new Error('trash entry not found');

  const { folders } = flattenTree(await getBookmarkTree());
  const plan = planRestore(entry, folders);

  let parentId = plan.existingParentId;
  for (const name of plan.foldersToCreate) {
    parentId = await createFolder(parentId, name);
  }

  await createBookmark({ parentId, title: entry.title, url: entry.url, index: plan.index });
  await deleteTrashEntries([trashId]);
  return plan;
}

/** Drops entries past the retention window. Returns the ids removed. */
export async function sweepExpiredTrash(now = Date.now()): Promise<string[]> {
  const expired = findExpiredEntries(await getAllTrashEntries(), now);
  if (expired.length > 0) await deleteTrashEntries(expired);
  return expired;
}
```

Note the deliberate `for ... await` in `softDeleteBookmarks` rather than `Promise.all`: removals are serialised so a mid-sequence failure leaves a clear, inspectable state instead of a partially-applied batch.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run src/services/trash.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/services/trash.ts src/services/trash.test.ts
git commit -m "feat: add trash with restore"
```

---

### Task 6: Backup

**Files:**
- Create: `src/core/backup/serialize.ts`, `src/adapters/download.ts`, `src/services/backup.ts`
- Test: `src/core/backup/serialize.test.ts`, `src/services/backup.test.ts`

**Interfaces:**
- Produces: `serializeTree(tree: BookmarkNode[]): { payload: string; bookmarkCount: number }`, `downloadJson(filename: string, json: string): void`, `createBackup(note: string): Promise<BackupSnapshot>`, `downloadBackup(backupId: string): Promise<void>`

The snapshot is stored rather than downloaded automatically — see this plan's design decisions. Only three are kept, so the store cannot grow without bound.

- [ ] **Step 1: Write the failing serializer test**

```ts
import { describe, expect, it } from 'vitest';
import { serializeTree } from './serialize';
import type { BookmarkNode } from '@/shared/types';

const tree: BookmarkNode[] = [{
  id: '0', title: '', children: [{
    id: '1', parentId: '0', title: 'Bookmarks bar', children: [
      { id: '10', parentId: '1', index: 0, title: 'Example', url: 'https://example.com/', dateAdded: 100 },
      { id: '11', parentId: '1', title: 'Empty', children: [] },
    ],
  }],
}];

describe('serializeTree', () => {
  it('counts only bookmarks, not folders', () => {
    expect(serializeTree(tree).bookmarkCount).toBe(1);
  });

  it('round-trips through JSON with the tree intact', () => {
    const parsed = JSON.parse(serializeTree(tree).payload) as BookmarkNode[];
    expect(parsed[0]!.children![0]!.children![0]!.url).toBe('https://example.com/');
  });

  it('handles an empty tree', () => {
    expect(serializeTree([])).toEqual({ payload: '[]', bookmarkCount: 0 });
  });
});
```

- [ ] **Step 2: Run it, see it fail, then write the serializer**

Run: `pnpm vitest run src/core/backup/serialize.test.ts` — FAIL, unresolved import.

```ts
import type { BookmarkNode } from '@/shared/types';

function countBookmarks(nodes: BookmarkNode[]): number {
  return nodes.reduce(
    (sum, node) => sum + (node.url === undefined ? countBookmarks(node.children ?? []) : 1),
    0,
  );
}

/** The whole tree as JSON, plus how many bookmarks it holds. Pure. */
export function serializeTree(tree: BookmarkNode[]): { payload: string; bookmarkCount: number } {
  return { payload: JSON.stringify(tree), bookmarkCount: countBookmarks(tree) };
}
```

Run again — PASS, 3 tests.

- [ ] **Step 3: Write the download adapter**

`src/adapters/download.ts` — an extension page can hand the user a file with an object URL and an anchor, which needs no `downloads` permission:

```ts
/** Hands the user a JSON file. Extension pages may do this without a permission. */
export function downloadJson(filename: string, json: string): void {
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
```

- [ ] **Step 4: Write the failing backup-service test**

```ts
import 'fake-indexeddb/auto';
import { deleteDB } from 'idb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BookmarkNode } from '@/shared/types';

const getBookmarkTree = vi.fn<() => Promise<BookmarkNode[]>>();
vi.mock('@/adapters/bookmarks', () => ({ getBookmarkTree: () => getBookmarkTree() }));
const downloadJson = vi.fn<(f: string, j: string) => void>();
vi.mock('@/adapters/download', () => ({ downloadJson: (f: string, j: string) => downloadJson(f, j) }));

const { createBackup, downloadBackup, MAX_BACKUPS } = await import('./backup');
const { getAllBackups, resetDbConnection, DB_NAME } = await import('@/adapters/db');

const tree: BookmarkNode[] = [{ id: '0', title: '', children: [
  { id: '10', parentId: '0', index: 0, title: 'Example', url: 'https://example.com/', dateAdded: 1 },
]}];

describe('backup service', () => {
  beforeEach(async () => {
    resetDbConnection();
    await deleteDB(DB_NAME);
    vi.clearAllMocks();
    getBookmarkTree.mockResolvedValue(tree);
  });

  it('stores a snapshot with its count and note', async () => {
    const snap = await createBackup('before removing 3 duplicates');
    expect(snap.bookmarkCount).toBe(1);
    expect(snap.note).toBe('before removing 3 duplicates');
    expect(await getAllBackups()).toHaveLength(1);
  });

  it(`keeps only the newest ${'MAX_BACKUPS'} snapshots`, async () => {
    for (let i = 0; i < MAX_BACKUPS + 2; i += 1) await createBackup(`run ${i}`);
    const kept = await getAllBackups();
    expect(kept).toHaveLength(MAX_BACKUPS);
    expect(kept[0]!.note).toBe(`run ${MAX_BACKUPS + 1}`);
  });

  it('hands a stored snapshot to the download adapter', async () => {
    const snap = await createBackup('note');
    await downloadBackup(snap.backupId);
    expect(downloadJson).toHaveBeenCalledWith(expect.stringMatching(/\.json$/), snap.payload);
  });

  it('rejects an unknown backup id', async () => {
    await expect(downloadBackup('nope')).rejects.toThrow();
  });
});
```

If two `createBackup` calls inside one millisecond collide on `createdAt` ordering, make the id monotonic rather than loosening the assertion, and say so in your report.

- [ ] **Step 5: Run it, see it fail, then write the service**

```ts
import { getBookmarkTree } from '@/adapters/bookmarks';
import { deleteBackup, getAllBackups, putBackup } from '@/adapters/db';
import { downloadJson } from '@/adapters/download';
import { serializeTree } from '@/core/backup/serialize';
import type { BackupSnapshot } from '@/shared/types';

export const MAX_BACKUPS = 3;

/**
 * Snapshots the whole tree before a bulk action. Stored rather than downloaded:
 * an automatic download before every action trains people to ignore it.
 * The note must never contain a URL or a title.
 */
export async function createBackup(note: string): Promise<BackupSnapshot> {
  const { payload, bookmarkCount } = serializeTree(await getBookmarkTree());
  const createdAt = Date.now();
  const snapshot: BackupSnapshot = {
    backupId: `${createdAt}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt, note, bookmarkCount, payload,
  };
  await putBackup(snapshot);

  const all = await getAllBackups();
  for (const stale of all.slice(MAX_BACKUPS)) await deleteBackup(stale.backupId);
  return snapshot;
}

export async function downloadBackup(backupId: string): Promise<void> {
  const snapshot = (await getAllBackups()).find((b) => b.backupId === backupId);
  if (!snapshot) throw new Error('backup not found');
  const stamp = new Date(snapshot.createdAt).toISOString().slice(0, 19).replace(/[:T]/g, '-');
  downloadJson(`bookmarks-backup-${stamp}.json`, snapshot.payload);
}
```

Run both test files — PASS.

- [ ] **Step 6: Commit**

```bash
git add src/core/backup src/adapters/download.ts src/services/backup.ts src/services/backup.test.ts
git commit -m "feat: export bookmark backup"
```

---

### Task 7: Selection, confirmation, and the trash list

**Files:**
- Create: `src/ui/components/ConfirmDialog.tsx`, `src/ui/components/TrashList.tsx`
- Modify: `src/ui/components/DuplicateList.tsx`
- Test: `src/ui/components/ConfirmDialog.test.tsx`, `src/ui/components/TrashList.test.tsx`, `src/ui/components/DuplicateList.test.tsx`

**Interfaces:**
- Produces: `ConfirmDialog`, `TrashList`; `DuplicateList` gains `selectedIds: ReadonlySet<string>` and `onToggle(id: string): void`

All three stay presentational — they take data and callbacks, and perform no I/O. `DuplicateList` gains checkboxes on the **duplicate** rows only: the keeper is never selectable, so the UI cannot express "delete every copy of this URL".

- [ ] **Step 1: Note the pre-existing test-isolation gap before adding tests**

`vitest.config.ts` has no `globals: true` and no `setupFiles`, so React Testing Library's auto-cleanup never registers and rendered DOM accumulates across tests within a file. The final review of Phase 1 flagged this as a latent trap. Fix it here, since this task adds three test files that would otherwise inherit it:

```ts
// vitest.config.ts
test: {
  environment: 'happy-dom',
  restoreMocks: true,
  setupFiles: ['./vitest.setup.ts'],
},
```

```ts
// vitest.setup.ts
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(cleanup);
```

Then simplify `src/entrypoints/dashboard/App.test.tsx`'s `within(container)` workaround back to plain `screen` queries, and confirm the suite still passes. If removing the workaround turns a test red, the isolation fix is incomplete — report that rather than restoring the workaround.

- [ ] **Step 2: Write the failing `ConfirmDialog` test**

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ConfirmDialog from './ConfirmDialog';

describe('ConfirmDialog', () => {
  it('renders nothing when closed', () => {
    const { container } = render(
      <ConfirmDialog open={false} count={3} onConfirm={vi.fn()} onCancel={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('states the exact count and that the action is reversible', () => {
    render(<ConfirmDialog open count={37} onConfirm={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByText(/37/)).toBeTruthy();
    expect(screen.getByText(/trash/i)).toBeTruthy();
  });

  it('calls back on confirm and on cancel', async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(<ConfirmDialog open count={1} onConfirm={onConfirm} onCancel={onCancel} />);
    screen.getByRole('button', { name: /move to trash/i }).click();
    screen.getByRole('button', { name: /cancel/i }).click();
    expect(onConfirm).toHaveBeenCalledOnce();
    expect(onCancel).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 3: Write `ConfirmDialog`**

```tsx
interface Props {
  open: boolean;
  count: number;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({ open, count, onConfirm, onCancel }: Props) {
  if (!open) return null;

  return (
    <div role="dialog" aria-modal="true"
         className="fixed inset-0 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-sm rounded-lg border border-slate-200 bg-white p-5 shadow-lg">
        <h2 className="text-base font-semibold text-slate-900">
          Move {count} {count === 1 ? 'bookmark' : 'bookmarks'} to Trash?
        </h2>
        <p className="mt-2 text-sm text-slate-500">
          Nothing is deleted permanently. Everything stays in Trash for 30 days and can be
          restored to its original folder. A backup is saved first.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onCancel}
                  className="rounded-md px-3 py-2 text-sm text-slate-600 hover:bg-slate-100">
            Cancel
          </button>
          <button type="button" onClick={onConfirm}
                  className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700">
            Move to Trash
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Write the failing `TrashList` test, then the component**

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import TrashList from './TrashList';
import type { TrashEntry } from '@/shared/types';

function entry(id: string, over: Partial<TrashEntry> = {}): TrashEntry {
  return {
    trashId: id, title: `Title ${id}`, url: `https://${id}.test/`,
    parentPath: ['Bookmarks bar', 'Dev'], index: 0,
    deletedAt: Date.UTC(2026, 8, 1), reason: 'duplicate', ...over,
  };
}

describe('TrashList', () => {
  it('shows an empty state', () => {
    render(<TrashList entries={[]} onRestore={vi.fn()} />);
    expect(screen.getByText(/trash is empty/i)).toBeTruthy();
  });

  it('shows each entry with its original folder and a restore control', () => {
    render(<TrashList entries={[entry('a')]} onRestore={vi.fn()} />);
    expect(screen.getByText('Title a')).toBeTruthy();
    expect(screen.getByText('Bookmarks bar / Dev')).toBeTruthy();
    expect(screen.getByRole('button', { name: /restore/i })).toBeTruthy();
  });

  it('passes the trash id to onRestore', () => {
    const onRestore = vi.fn();
    render(<TrashList entries={[entry('a')]} onRestore={onRestore} />);
    screen.getByRole('button', { name: /restore/i }).click();
    expect(onRestore).toHaveBeenCalledWith('a');
  });

  it('labels an entry restored to the top level', () => {
    render(<TrashList entries={[entry('b', { parentPath: [] })]} onRestore={vi.fn()} />);
    expect(screen.getByText('(top level)')).toBeTruthy();
  });
});
```

```tsx
import type { TrashEntry } from '@/shared/types';

interface Props {
  entries: TrashEntry[];
  onRestore: (trashId: string) => void;
}

export default function TrashList({ entries, onRestore }: Props) {
  if (entries.length === 0) {
    return <p className="text-sm text-slate-500">Trash is empty.</p>;
  }

  return (
    <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
      {entries.map((entry) => (
        <li key={entry.trashId} className="flex items-baseline gap-2 px-4 py-2 text-sm">
          <span className="truncate text-slate-900">{entry.title || '(untitled)'}</span>
          <span className="text-slate-400">
            {entry.parentPath.length > 0 ? entry.parentPath.join(' / ') : '(top level)'}
          </span>
          <button type="button" onClick={() => onRestore(entry.trashId)}
                  className="ml-auto rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50">
            Restore
          </button>
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 5: Add selection to `DuplicateList`**

Extend the props and render a checkbox on each duplicate row. The keeper row keeps its `keep` badge and gets **no** checkbox.

```tsx
interface Props {
  groups: DuplicateGroup[];
  selectedIds: ReadonlySet<string>;
  onToggle: (id: string) => void;
}
```

On each duplicate `<li>`, before the badge:

```tsx
<input
  type="checkbox"
  checked={selectedIds.has(duplicate.id)}
  onChange={() => onToggle(duplicate.id)}
  aria-label={`Select ${duplicate.title || 'untitled bookmark'}`}
  className="accent-slate-900"
/>
```

Add to `DuplicateList.test.tsx`:

```tsx
it('offers a checkbox for a duplicate but never for the keeper', () => {
  render(<DuplicateList groups={[group]} selectedIds={new Set()} onToggle={vi.fn()} />);
  expect(screen.getAllByRole('checkbox')).toHaveLength(1);
});

it('reports the toggled id', () => {
  const onToggle = vi.fn();
  render(<DuplicateList groups={[group]} selectedIds={new Set()} onToggle={onToggle} />);
  screen.getByRole('checkbox').click();
  expect(onToggle).toHaveBeenCalledWith('b');
});

it('reflects the selection it is given', () => {
  render(<DuplicateList groups={[group]} selectedIds={new Set(['b'])} onToggle={vi.fn()} />);
  expect(screen.getByRole('checkbox')).toHaveProperty('checked', true);
});
```

The existing `DuplicateList` tests need the two new props added; keep their assertions unchanged.

- [ ] **Step 6: Run every component test and commit**

Run: `pnpm vitest run src/ui src/entrypoints && pnpm typecheck`

```bash
git add vitest.config.ts vitest.setup.ts src/ui/components src/entrypoints/dashboard/App.test.tsx
git commit -m "feat: add selection, confirm dialog and trash list"
```

---

### Task 8: Wire the dashboard, and sweep on startup

**Files:**
- Modify: `src/entrypoints/dashboard/App.tsx`, `src/entrypoints/background.ts`
- Test: `src/entrypoints/dashboard/App.test.tsx`, `src/entrypoints/background.test.ts`

**Interfaces:**
- Consumes: everything above

The dashboard stops being read-only. The flow is fixed and not configurable: select duplicates → confirm, with the count shown → a backup is written → the bookmarks move to Trash → the audit re-runs → the Trash section shows what moved, each with a Restore button.

- [ ] **Step 1: Extend the dashboard**

Add to the existing state machine rather than replacing it: `selectedIds: Set<string>`, `confirmOpen: boolean`, `trash: TrashEntry[]`, and a `busy` flag that disables the action while it runs.

The action handler, in order:

```ts
const moveSelectedToTrash = async () => {
  if (state.status !== 'ready' || selectedIds.size === 0) return;
  setBusy(true);
  try {
    const records = state.report.duplicateGroups
      .flatMap((g) => g.duplicates)
      .filter((d) => selectedIds.has(d.id));

    await createBackup(`before moving ${records.length} duplicates to Trash`);
    await softDeleteBookmarks(records, 'duplicate');

    setSelectedIds(new Set());
    setConfirmOpen(false);
    await refresh();
  } catch (error: unknown) {
    setState({ status: 'error', message: error instanceof Error ? error.message : String(error) });
  } finally {
    setBusy(false);
  }
};
```

`refresh()` re-runs `runAudit()` and reloads the trash entries; extract it from the existing mount effect so both paths share it. Sweep expired entries on mount via `sweepExpiredTrash()` before loading the list.

The action button lives above the duplicates list, is disabled when nothing is selected, and names the count: `Move {n} to Trash`. Replace the "Read-only for now" copy with an accurate line about Trash and the 30-day window.

- [ ] **Step 2: Extend the dashboard test**

Mock `@/services/trash` and `@/services/backup` alongside the existing `@/services/audit` mock, then cover:

```tsx
it('disables the action until something is selected', async () => { /* ... */ });

it('writes a backup before it moves anything to trash', async () => {
  // assert the call order: createBackup resolves before softDeleteBookmarks is called
  const order: string[] = [];
  createBackup.mockImplementation(async () => { order.push('backup'); return snapshot; });
  softDeleteBookmarks.mockImplementation(async () => { order.push('delete'); return []; });
  // select a duplicate, confirm, then:
  expect(order).toEqual(['backup', 'delete']);
});

it('does not move anything when the dialog is cancelled', async () => { /* ... */ });

it('surfaces a failure without leaving the view stuck busy', async () => { /* ... */ });
```

The backup-before-delete ordering assertion is the important one — it is the constraint this whole phase exists to guarantee, and it must be enforced at the UI level too, not only inside the service.

- [ ] **Step 3: Surface the backups, so `downloadBackup` is not a dead end**

§5.4 says the backup is "downloadable from settings", and there is no settings
entrypoint yet. Rather than build one for a single button, add a **Backups**
section to the dashboard listing the stored snapshots — each with its note, its
bookmark count, when it was taken, and a Download button calling
`downloadBackup(backupId)`.

Without this step Task 6 ships a function nothing calls, and the user is told a
backup was written with no way to reach it. Record in `docs/roadmap.md` that the
settings page absorbs this section when it arrives in Phase 4.

Cover it in the dashboard test: after a bulk action, a backup row appears, and
clicking Download calls the service with that snapshot's id.

- [ ] **Step 4: Sweep expired trash from the background**

In `src/entrypoints/background.ts`, alongside the existing sync listeners:

```ts
browser.runtime.onStartup.addListener(() =>
  void sweepExpiredTrash().catch((error: unknown) =>
    console.error('[sbc] trash sweep failed', error)),
);
```

Follow the established error-handling shape exactly, and add a test in the style of the existing startup-sync test.

- [ ] **Step 5: Verify the whole build**

```bash
pnpm typecheck && pnpm test && pnpm build
```

Load `.output/chrome-mv3` in Chrome and walk it once by hand on a real profile: select two duplicates, confirm, see them leave the list and appear in Trash, restore one, and confirm it returns to its original folder in Chrome's own bookmark manager. Confirm the manifest still requests exactly `["bookmarks","storage"]`.

- [ ] **Step 6: Commit**

```bash
git add src/entrypoints docs/roadmap.md
git commit -m "feat: add guarded bulk actions"
```

---

## Definition of done

- `pnpm typecheck && pnpm test && pnpm build` clean.
- Manifest permissions still exactly `["bookmarks","storage"]` — verify in `.output/chrome-mv3/manifest.json`.
- `src/architecture.test.ts` passes, and was demonstrated to fail when a mutating adapter is referenced outside `src/services/trash.ts`.
- A bookmark moved to Trash and restored lands back in its original folder, verified by hand against Chrome's bookmark manager.
- A backup exists in the `backups` store after a bulk action, and downloads as valid JSON from the UI.
- No path anywhere deletes a bookmark without an explicit user action. No setting enables one.
- Every task committed separately, in order.

Next phase: the dead-link scan (roadmap items 14–22), which is now safe to build — every verdict it produces can only ever feed a reversible action.
