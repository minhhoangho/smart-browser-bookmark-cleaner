import { describe, expect, it } from 'vitest';
import { reconcile } from './reconcile';
import type { BookmarkRecord } from '@/shared/types';

function rec(over: Partial<BookmarkRecord> & Pick<BookmarkRecord, 'id'>): BookmarkRecord {
  return {
    parentId: '1',
    path: ['Bookmarks bar'],
    index: 0,
    title: 'Example',
    url: 'https://example.com/',
    normalizedUrl: 'https://example.com/',
    dateAdded: 1,
    scannable: true,
    ...over,
  };
}

describe('reconcile', () => {
  it('reports nothing to do when the two sides match', () => {
    const same = [rec({ id: 'a' })];
    expect(reconcile(same, [rec({ id: 'a' })])).toEqual({
      added: [], updated: [], removed: [], invalidated: [],
    });
  });

  it('reports bookmarks added outside the extension', () => {
    const plan = reconcile([rec({ id: 'a' }), rec({ id: 'b' })], [rec({ id: 'a' })]);
    expect(plan.added.map((r) => r.id)).toEqual(['b']);
  });

  it('reports bookmarks removed outside the extension', () => {
    const plan = reconcile([rec({ id: 'a' })], [rec({ id: 'a' }), rec({ id: 'gone' })]);
    expect(plan.removed).toEqual(['gone']);
  });

  it('updates a moved or renamed bookmark without invalidating it', () => {
    const plan = reconcile(
      [rec({ id: 'a', title: 'Renamed', parentId: '9', path: ['Bookmarks bar', 'Dev'] })],
      [rec({ id: 'a' })],
    );
    expect(plan.updated.map((r) => r.id)).toEqual(['a']);
    expect(plan.invalidated).toEqual([]);
  });

  it('invalidates a bookmark whose url changed', () => {
    const plan = reconcile(
      [rec({ id: 'a', url: 'https://other.test/', normalizedUrl: 'https://other.test/' })],
      [rec({ id: 'a' })],
    );
    expect(plan.updated.map((r) => r.id)).toEqual(['a']);
    expect(plan.invalidated).toEqual(['a']);
  });

  it('updates a record when its normalizedUrl was re-derived, without invalidating it', () => {
    // Same page, same url — only what a widened normalizeUrl would produce differs.
    const plan = reconcile(
      [rec({ id: 'a', normalizedUrl: 'https://example.com' })],
      [rec({ id: 'a' })],
    );
    expect(plan.updated.map((r) => r.id)).toEqual(['a']);
    expect(plan.invalidated).toEqual([]);
  });

  it('updates a record when its scannable flag was re-derived, without invalidating it', () => {
    // Same page, same url — only what a widened isScannable predicate would produce differs.
    const plan = reconcile(
      [rec({ id: 'a', scannable: false })],
      [rec({ id: 'a' })],
    );
    expect(plan.updated.map((r) => r.id)).toEqual(['a']);
    expect(plan.invalidated).toEqual([]);
  });
});
