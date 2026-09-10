import { describe, expect, it } from 'vitest';
import { buildAuditReport } from './audit';
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
          { id: '11', parentId: '1', index: 1, title: 'Example again', url: 'https://www.example.com/?utm_source=x', dateAdded: 200 },
          { id: '12', parentId: '1', index: 2, title: 'Local', url: 'http://localhost:3000/', dateAdded: 300 },
          { id: '13', parentId: '1', title: 'Empty', children: [] },
        ],
      },
    ],
  },
];

describe('buildAuditReport', () => {
  it('counts bookmarks and folders', () => {
    const report = buildAuditReport(tree);
    expect(report.totalBookmarks).toBe(3);
    expect(report.totalFolders).toBe(2);
  });

  it('groups duplicates across www, scheme, and tracking params', () => {
    const report = buildAuditReport(tree);
    expect(report.duplicateGroups).toHaveLength(1);
    expect(report.duplicateGroups[0]!.keeper.id).toBe('10');
    expect(report.duplicateGroups[0]!.duplicates.map((d) => d.id)).toEqual(['11']);
  });

  it('lists empty folders and unscannable entries', () => {
    const report = buildAuditReport(tree);
    expect(report.emptyFolders.map((f) => f.id)).toEqual(['13']);
    expect(report.unscannable.map((b) => b.id)).toEqual(['12']);
  });

  it('reports how many bookmarks are removable without losing a url', () => {
    expect(buildAuditReport(tree).redundantCount).toBe(1);
  });

  it('handles an empty tree', () => {
    const report = buildAuditReport([]);
    expect(report).toMatchObject({
      totalBookmarks: 0, totalFolders: 0, redundantCount: 0,
      duplicateGroups: [], emptyFolders: [], unscannable: [],
    });
  });
});
