import type { BookmarkNode, BookmarkRecord, FolderRecord } from '@/shared/types';
import { normalizeUrl } from './normalize-url';
import { isScannable } from './classify-entry';

export interface FlattenResult {
  bookmarks: BookmarkRecord[];
  folders: FolderRecord[];
}

/** Depth-first flatten of the browser's bookmark tree, preserving folder paths. */
export function flattenTree(roots: BookmarkNode[]): FlattenResult {
  const bookmarks: BookmarkRecord[] = [];
  const folders: FolderRecord[] = [];

  const walk = (node: BookmarkNode, path: string[], depth: number): void => {
    if (node.url === undefined) {
      // depth 0 is the invisible root, which is not a folder the user can see
      if (depth > 0) {
        folders.push({
          id: node.id,
          parentId: node.parentId ?? '',
          path,
          title: node.title,
          depth,
          isProtected: depth <= 1,
        });
      }
      const childPath = depth > 0 ? [...path, node.title] : path;
      for (const child of node.children ?? []) walk(child, childPath, depth + 1);
      return;
    }

    bookmarks.push({
      id: node.id,
      parentId: node.parentId ?? '',
      path,
      index: node.index ?? 0,
      title: node.title,
      url: node.url,
      normalizedUrl: normalizeUrl(node.url),
      dateAdded: node.dateAdded ?? 0,
      scannable: isScannable(node.url),
    });
  };

  for (const root of roots) walk(root, [], 0);
  return { bookmarks, folders };
}
