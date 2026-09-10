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
    void syncBookmarkIndex().catch((error: unknown) => {
      console.error('[sbc] scheduled bookmark sync failed', error);
    });
  }, delayMs);
}
