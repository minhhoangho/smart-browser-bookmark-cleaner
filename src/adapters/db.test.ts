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
