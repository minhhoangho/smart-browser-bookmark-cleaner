import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AuditReport } from '@/core/bookmarks/audit';

const runAudit = vi.fn<() => Promise<AuditReport>>();
vi.mock('@/services/audit', () => ({ runAudit: () => runAudit() }));

const { default: App } = await import('./App');

function emptyReport(): AuditReport {
  return {
    totalBookmarks: 0,
    totalFolders: 0,
    duplicateGroups: [],
    emptyFolders: [],
    unscannable: [],
    redundantCount: 0,
  };
}

/** The value shown on the summary card whose label matches exactly (case-sensitive, to avoid matching the section `<h2>`s that reuse the same words with different capitalization). */
function summaryCardValue(label: string): string | null {
  return screen.getByText(label).parentElement?.firstElementChild?.textContent ?? null;
}

describe('dashboard App', () => {
  afterEach(() => {
    runAudit.mockReset();
  });

  it('shows a loading message before the audit resolves', () => {
    runAudit.mockReturnValue(new Promise(() => {}));

    render(<App />);

    expect(screen.getByText(/reading your bookmarks/i)).toBeTruthy();
  });

  it('shows the failure message, not bookmark content, when the audit rejects', async () => {
    runAudit.mockRejectedValue(new Error('read failed'));

    render(<App />);

    expect(await screen.findByText(/could not read your bookmarks/i)).toBeTruthy();
    expect(screen.getByText(/read failed/i)).toBeTruthy();
  });

  it('wires each distinct audit count onto its matching summary card', async () => {
    runAudit.mockResolvedValue({
      ...emptyReport(),
      totalBookmarks: 40,
      redundantCount: 7,
      emptyFolders: [
        { id: 'f1', parentId: '1', path: ['Bookmarks bar'], title: 'Old links', depth: 1, isProtected: false },
        { id: 'f2', parentId: '1', path: ['Bookmarks bar'], title: 'Unused', depth: 1, isProtected: false },
      ],
      unscannable: [
        {
          id: 'b1', parentId: '1', path: [], index: 0, title: 'Local file',
          url: 'file:///notes.txt', normalizedUrl: 'file:///notes.txt', dateAdded: 1, scannable: false,
        },
      ],
    });

    render(<App />);

    // Waits for the ready state; the four values below are all distinct, so a
    // wiring mistake (e.g. emptyFolders.length passed as unscannableCount)
    // would land a wrong number on the wrong card instead of accidentally
    // matching.
    expect(await screen.findByText('40')).toBeTruthy();
    expect(summaryCardValue('bookmarks')).toBe('40');
    expect(summaryCardValue('redundant copies')).toBe('7');
    expect(summaryCardValue('empty folders')).toBe('2');
    expect(summaryCardValue('not checkable')).toBe('1');
  });
});
