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
  void connection?.then((db) => db.close());
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
