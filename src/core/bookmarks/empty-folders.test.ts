import { describe, expect, it } from 'vitest';
import { findEmptyFolders } from './empty-folders';
import type { BookmarkRecord, FolderRecord } from '@/shared/types';

const folders: FolderRecord[] = [
  { id: '1', parentId: '0', path: [], title: 'Bookmarks bar', depth: 1, isProtected: true },
  { id: '2', parentId: '0', path: [], title: 'Other bookmarks', depth: 1, isProtected: true },
  { id: '10', parentId: '1', path: ['Bookmarks bar'], title: 'Dev', depth: 2, isProtected: false },
  { id: '100', parentId: '10', path: ['Bookmarks bar', 'Dev'], title: 'Rust', depth: 3, isProtected: false },
  { id: '11', parentId: '1', path: ['Bookmarks bar'], title: 'Old', depth: 2, isProtected: false },
  { id: '110', parentId: '11', path: ['Bookmarks bar', 'Old'], title: 'Older', depth: 3, isProtected: false },
];

const bookmarks: BookmarkRecord[] = [
  {
    id: 'b1', parentId: '100', path: ['Bookmarks bar', 'Dev', 'Rust'], index: 0,
    title: 'Rust book', url: 'https://doc.rust-lang.org/book/',
    normalizedUrl: 'https://doc.rust-lang.org/book', dateAdded: 1, scannable: true,
  },
];

describe('findEmptyFolders', () => {
  it('reports folders with no bookmark descendants', () => {
    expect(findEmptyFolders(folders, bookmarks).map((f) => f.id)).toEqual(['11', '110']);
  });

  it('treats an ancestor of a deeply nested bookmark as non-empty', () => {
    const ids = findEmptyFolders(folders, bookmarks).map((f) => f.id);
    expect(ids).not.toContain('10');
    expect(ids).not.toContain('100');
  });

  it('never reports protected folders', () => {
    expect(findEmptyFolders(folders, []).map((f) => f.id)).toEqual(['10', '100', '11', '110']);
  });
});
