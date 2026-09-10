import { describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';

describe('toolchain', () => {
  it('exposes a fake bookmarks API to tests', async () => {
    expect(fakeBrowser.bookmarks).toBeDefined();
  });
});
