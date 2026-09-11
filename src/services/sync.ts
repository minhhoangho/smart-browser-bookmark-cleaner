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
 * into a single sync. If the service worker is terminated before the timer
 * fires, the pending sync is lost — it is not persisted or resumed. The index
 * then stays stale until the next bookmark change reschedules a sync, or the
 * browser restarts (`runtime.onStartup`) or the extension is installed/updated
 * (`runtime.onInstalled`), both of which sync unconditionally. Opening the
 * dashboard does **not** recover it: the dashboard reads the live bookmark
 * tree directly and never touches the stored index.
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
