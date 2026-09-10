import type { BookmarkNode, BookmarkRecord, FolderRecord } from '@/shared/types';
import { flattenTree } from './flatten';
import { findDuplicates, type DuplicateGroup } from './duplicates';
import { findEmptyFolders } from './empty-folders';

export interface AuditReport {
  totalBookmarks: number;
  totalFolders: number;
  duplicateGroups: DuplicateGroup[];
  emptyFolders: FolderRecord[];
  /** Entries the link scanner will never touch: bookmarklets, local files, intranet hosts. */
  unscannable: BookmarkRecord[];
  /** Bookmarks that could be removed without losing any distinct URL. */
  redundantCount: number;
}

/** The complete offline audit, as a pure function of the bookmark tree. */
export function buildAuditReport(tree: BookmarkNode[]): AuditReport {
  const { bookmarks, folders } = flattenTree(tree);
  const duplicateGroups = findDuplicates(bookmarks);

  return {
    totalBookmarks: bookmarks.length,
    totalFolders: folders.length,
    duplicateGroups,
    emptyFolders: findEmptyFolders(folders, bookmarks),
    unscannable: bookmarks.filter((b) => !b.scannable),
    redundantCount: duplicateGroups.reduce((sum, g) => sum + g.duplicates.length, 0),
  };
}
