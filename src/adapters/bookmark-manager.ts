import { browser } from '#imports';

/**
 * Chrome's own bookmark manager, opened at a folder. This only opens a tab — it
 * never reads or changes a bookmark — so it does not weaken the rule that
 * nothing in this extension deletes anything.
 */
export function bookmarkManagerUrl(folderId: string): string {
  return `chrome://bookmarks/?id=${encodeURIComponent(folderId)}`;
}

export async function openBookmarkManager(folderId: string): Promise<void> {
  await browser.tabs.create({ url: bookmarkManagerUrl(folderId) });
}
