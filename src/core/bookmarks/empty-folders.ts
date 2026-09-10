import type { BookmarkRecord, FolderRecord } from '@/shared/types';

/**
 * Folders with no bookmark anywhere beneath them. Protected built-in folders
 * are never returned. Walks each bookmark's ancestor chain once, stopping as
 * soon as it reaches a folder already known to be non-empty.
 */
export function findEmptyFolders(
  folders: FolderRecord[],
  bookmarks: BookmarkRecord[],
): FolderRecord[] {
  const byId = new Map(folders.map((f) => [f.id, f]));
  const nonEmpty = new Set<string>();

  for (const bookmark of bookmarks) {
    let cursor: string | undefined = bookmark.parentId;
    while (cursor && !nonEmpty.has(cursor)) {
      nonEmpty.add(cursor);
      cursor = byId.get(cursor)?.parentId;
    }
  }

  return folders.filter((f) => !f.isProtected && !nonEmpty.has(f.id));
}
