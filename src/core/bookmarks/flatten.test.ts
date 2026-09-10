import { describe, expect, it } from 'vitest';
import { flattenTree } from './flatten';
import type { BookmarkNode } from '@/shared/types';

const tree: BookmarkNode[] = [
  {
    id: '0',
    title: '',
    children: [
      {
        id: '1',
        parentId: '0',
        title: 'Bookmarks bar',
        children: [
          { id: '10', parentId: '1', index: 0, title: 'Example', url: 'https://example.com/', dateAdded: 100 },
          {
            id: '11',
            parentId: '1',
            title: 'Dev',
            children: [
              { id: '110', parentId: '11', index: 0, title: 'Repo', url: 'https://github.com/a/b', dateAdded: 200 },
              { id: '111', parentId: '11', index: 1, title: 'Bookmarklet', url: 'javascript:alert(1)', dateAdded: 300 },
            ],
          },
        ],
      },
      { id: '2', parentId: '0', title: 'Other bookmarks', children: [] },
    ],
  },
];

describe('flattenTree', () => {
  it('returns every bookmark with its folder path', () => {
    const { bookmarks } = flattenTree(tree);
    expect(bookmarks.map((b) => b.id)).toEqual(['10', '110', '111']);
    expect(bookmarks[0]!.path).toEqual(['Bookmarks bar']);
    expect(bookmarks[1]!.path).toEqual(['Bookmarks bar', 'Dev']);
  });

  it('normalizes urls and marks scannability', () => {
    const { bookmarks } = flattenTree(tree);
    expect(bookmarks[0]!.normalizedUrl).toBe('https://example.com/');
    expect(bookmarks[0]!.scannable).toBe(true);
    expect(bookmarks[2]!.scannable).toBe(false);
  });

  it('returns folders without the invisible root, with depth and protection', () => {
    const { folders } = flattenTree(tree);
    expect(folders.map((f) => f.id)).toEqual(['1', '11', '2']);
    expect(folders.find((f) => f.id === '1')).toMatchObject({ depth: 1, isProtected: true, path: [] });
    expect(folders.find((f) => f.id === '11')).toMatchObject({ depth: 2, isProtected: false, path: ['Bookmarks bar'] });
  });

  it('fills in missing optional fields', () => {
    const { bookmarks } = flattenTree([
      { id: '9', title: 'Bare', url: 'https://bare.test/' },
    ]);
    expect(bookmarks[0]).toMatchObject({ parentId: '', index: 0, dateAdded: 0, path: [] });
  });
});
