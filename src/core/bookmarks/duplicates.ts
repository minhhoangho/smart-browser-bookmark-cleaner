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
