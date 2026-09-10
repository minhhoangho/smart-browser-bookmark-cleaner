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
