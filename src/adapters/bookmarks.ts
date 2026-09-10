import { browser } from '#imports';
import type { BookmarkNode } from '@/shared/types';

/**
 * The browser's own node type carries extra fields we ignore; the cast keeps
 * `src/core/**` free of any dependency on the extension API's types.
 */
export async function getBookmarkTree(): Promise<BookmarkNode[]> {
  return (await browser.bookmarks.getTree()) as BookmarkNode[];
}
