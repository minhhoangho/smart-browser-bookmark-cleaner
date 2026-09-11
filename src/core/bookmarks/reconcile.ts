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

/**
 * True when data derived from the (unchanged) url — `normalizedUrl` and
 * `scannable` — no longer matches what is stored. This catches a widened
 * `isScannable` predicate or an extended tracking-param list re-deriving a
 * different value for an already-indexed bookmark, so the fix heals on the
 * next sync instead of leaving stale derived data behind indefinitely.
 */
function derivedDataChanged(a: BookmarkRecord, b: BookmarkRecord): boolean {
  return a.normalizedUrl !== b.normalizedUrl || a.scannable !== b.scannable;
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
    } else if (!isSamePlacement(previous, record) || derivedDataChanged(previous, record)) {
      plan.updated.push(record);
    }
  }

  plan.removed = [...storedById.keys()];
  return plan;
}
