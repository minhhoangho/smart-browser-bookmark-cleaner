import 'fake-indexeddb/auto';
import { deleteDB } from 'idb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

const { syncBookmarkIndex, scheduleSync } = await import('./sync');
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

describe('scheduleSync', () => {
  beforeEach(async () => {
    resetDbConnection();
    await deleteDB(DB_NAME);
    getBookmarkTree.mockReset();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('reports a failed sync instead of swallowing it', async () => {
    const failure = new Error('boom');
    getBookmarkTree.mockRejectedValue(failure);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    const unhandledRejections: unknown[] = [];
    const onUnhandledRejection = (reason: unknown): void => {
      unhandledRejections.push(reason);
    };
    process.on('unhandledRejection', onUnhandledRejection);

    try {
      scheduleSync();
      await vi.advanceTimersByTimeAsync(2000);
      // Give a stray unhandled rejection a chance to surface before asserting
      // there isn't one — Node schedules the event a tick after the promise
      // settles unhandled.
      await Promise.resolve();
      await Promise.resolve();
    } finally {
      process.off('unhandledRejection', onUnhandledRejection);
    }

    expect(consoleError).toHaveBeenCalledTimes(1);
    expect(consoleError.mock.calls[0]?.[1]).toBe(failure);
    expect(unhandledRejections).toEqual([]);
  });
});
