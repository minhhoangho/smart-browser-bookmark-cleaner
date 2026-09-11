import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';

const syncBookmarkIndex = vi.fn(async () => ({ added: [], updated: [], removed: [], invalidated: [] }));
const scheduleSync = vi.fn();
vi.mock('@/services/sync', () => ({
  syncBookmarkIndex: () => syncBookmarkIndex(),
  scheduleSync: () => scheduleSync(),
}));

const { default: background } = await import('./background');

type Listener = () => void;

/**
 * @webext-core/fake-browser 2.0.1 ships no in-memory implementation for
 * `bookmarks.*` events: every method on them (`addListener`, `hasListener`,
 * `hasListeners`, ...) throws `MockNotImplementedError`, and there is no
 * `trigger()` at all (unlike `runtime.onInstalled`/`onStartup`, which do have
 * a working `trigger()`). So each bookmark event's `addListener` is stubbed
 * here and the registered callback captured, which lets the test invoke the
 * real listener directly and prove it calls `scheduleSync` — a stronger
 * assertion than `hasListeners()` (unavailable anyway) since it exercises the
 * listener body, not just the fact that something was registered.
 */
function captureListener(event: { addListener: (listener: Listener) => void }): { current?: Listener } {
  const box: { current?: Listener } = {};
  vi.spyOn(event, 'addListener').mockImplementation((fn) => {
    box.current = fn;
  });
  return box;
}

describe('background', () => {
  let onCreated: { current?: Listener };
  let onRemoved: { current?: Listener };
  let onChanged: { current?: Listener };
  let onMoved: { current?: Listener };

  beforeEach(() => {
    fakeBrowser.reset();
    syncBookmarkIndex.mockClear();
    scheduleSync.mockClear();
    onCreated = captureListener(fakeBrowser.bookmarks.onCreated);
    onRemoved = captureListener(fakeBrowser.bookmarks.onRemoved);
    onChanged = captureListener(fakeBrowser.bookmarks.onChanged);
    onMoved = captureListener(fakeBrowser.bookmarks.onMoved);
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

  it('schedules a debounced sync when a bookmark is created', () => {
    expect(onCreated.current).toBeDefined();
    onCreated.current?.();
    expect(scheduleSync).toHaveBeenCalledOnce();
  });

  it('schedules a debounced sync when a bookmark is removed', () => {
    expect(onRemoved.current).toBeDefined();
    onRemoved.current?.();
    expect(scheduleSync).toHaveBeenCalledOnce();
  });

  it('schedules a debounced sync when a bookmark is changed', () => {
    expect(onChanged.current).toBeDefined();
    onChanged.current?.();
    expect(scheduleSync).toHaveBeenCalledOnce();
  });

  it('schedules a debounced sync when a bookmark is moved', () => {
    expect(onMoved.current).toBeDefined();
    onMoved.current?.();
    expect(scheduleSync).toHaveBeenCalledOnce();
  });
});
