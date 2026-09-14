import { describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { bookmarkManagerUrl, openBookmarkManager } from './bookmark-manager';

describe('bookmark manager adapter', () => {
  it("points at the folder in Chrome's bookmark manager", () => {
    expect(bookmarkManagerUrl('11')).toBe('chrome://bookmarks/?id=11');
  });

  it('encodes the folder id', () => {
    expect(bookmarkManagerUrl('a&b c')).toBe('chrome://bookmarks/?id=a%26b%20c');
  });

  it('opens a new tab at that folder', async () => {
    const create = vi.spyOn(fakeBrowser.tabs, 'create');
    await openBookmarkManager('11');
    expect(create).toHaveBeenCalledWith({ url: 'chrome://bookmarks/?id=11' });
  });
});
