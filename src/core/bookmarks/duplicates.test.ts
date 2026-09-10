import { describe, expect, it } from 'vitest';
import { findDuplicates } from './duplicates';
import type { BookmarkRecord } from '@/shared/types';

function rec(over: Partial<BookmarkRecord> & Pick<BookmarkRecord, 'id' | 'normalizedUrl'>): BookmarkRecord {
  return {
    parentId: '1',
    path: ['Bookmarks bar'],
    index: 0,
    title: 'x',
    url: 'https://example.com/',
    dateAdded: 0,
    scannable: true,
    ...over,
  };
}

describe('findDuplicates', () => {
  it('ignores urls that appear once', () => {
    const groups = findDuplicates([
      rec({ id: 'a', normalizedUrl: 'https://a.test/' }),
      rec({ id: 'b', normalizedUrl: 'https://b.test/' }),
    ]);
    expect(groups).toEqual([]);
  });

  it('prefers the shallowest copy as keeper', () => {
    const groups = findDuplicates([
      rec({ id: 'deep', normalizedUrl: 'https://a.test/', path: ['Bar', 'Dev', 'Rust'] }),
      rec({ id: 'shallow', normalizedUrl: 'https://a.test/', path: ['Bar'] }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.keeper.id).toBe('shallow');
    expect(groups[0]!.duplicates.map((d) => d.id)).toEqual(['deep']);
  });

  it('breaks a depth tie with the oldest copy', () => {
    const groups = findDuplicates([
      rec({ id: 'new', normalizedUrl: 'https://a.test/', dateAdded: 500 }),
      rec({ id: 'old', normalizedUrl: 'https://a.test/', dateAdded: 100 }),
    ]);
    expect(groups[0]!.keeper.id).toBe('old');
  });

  it('is deterministic when depth and date tie', () => {
    const input = [
      rec({ id: 'b', normalizedUrl: 'https://a.test/' }),
      rec({ id: 'a', normalizedUrl: 'https://a.test/' }),
    ];
    expect(findDuplicates(input)[0]!.keeper.id).toBe('a');
    expect(findDuplicates([...input].reverse())[0]!.keeper.id).toBe('a');
  });

  it('groups three copies and orders groups by size', () => {
    const groups = findDuplicates([
      rec({ id: 'p1', normalizedUrl: 'https://pair.test/' }),
      rec({ id: 'p2', normalizedUrl: 'https://pair.test/' }),
      rec({ id: 't1', normalizedUrl: 'https://trio.test/' }),
      rec({ id: 't2', normalizedUrl: 'https://trio.test/' }),
      rec({ id: 't3', normalizedUrl: 'https://trio.test/' }),
    ]);
    expect(groups.map((g) => g.normalizedUrl)).toEqual(['https://trio.test/', 'https://pair.test/']);
    expect(groups[0]!.duplicates).toHaveLength(2);
  });
});
