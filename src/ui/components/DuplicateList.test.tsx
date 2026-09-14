import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import DuplicateList from './DuplicateList';
import type { BookmarkRecord } from '@/shared/types';

function rec(id: string, title: string, path: string[]): BookmarkRecord {
  return {
    id, parentId: '1', path, index: 0, title,
    url: 'https://example.com/', normalizedUrl: 'https://example.com/',
    dateAdded: 1, scannable: true,
  };
}

describe('DuplicateList', () => {
  it('renders an empty state when there is nothing to show', () => {
    render(<DuplicateList groups={[]} />);
    expect(screen.getByText(/no duplicates/i)).toBeTruthy();
  });

  it('marks the keeper and lists the other copies with their folder path', () => {
    render(
      <DuplicateList
        groups={[
          {
            normalizedUrl: 'https://example.com/',
            keeper: rec('a', 'Example', ['Bookmarks bar']),
            duplicates: [rec('b', 'Example again', ['Bookmarks bar', 'Dev'])],
          },
        ]}
      />,
    );

    expect(screen.getByText('https://example.com/')).toBeTruthy();
    expect(screen.getByText(/keep/i)).toBeTruthy();
    expect(screen.getByText('Example again')).toBeTruthy();
    expect(screen.getByText('Bookmarks bar / Dev')).toBeTruthy();
  });

  it('offers Show in Chrome on the keeper and on every copy, each opening its own folder', () => {
    const onOpenFolder = vi.fn();
    render(
      <DuplicateList
        groups={[
          {
            normalizedUrl: 'https://example.com/',
            keeper: { ...rec('a', 'Example', ['Bookmarks bar']), parentId: 'bar' },
            duplicates: [{ ...rec('b', 'Example', ['Bookmarks bar', 'Dev']), parentId: 'dev' }],
          },
        ]}
        onOpenFolder={onOpenFolder}
      />,
    );

    // Both rows share a title, as real duplicates usually do: the folder path in
    // the accessible name is what tells the two buttons apart.
    screen.getByRole('button', { name: 'Show "Example" (Bookmarks bar / Dev) in Chrome' }).click();
    expect(onOpenFolder).toHaveBeenCalledWith('dev');

    screen.getByRole('button', { name: 'Show "Example" (Bookmarks bar) in Chrome' }).click();
    expect(onOpenFolder).toHaveBeenLastCalledWith('bar');
  });

  it('shows no Show in Chrome control without a handler', () => {
    render(
      <DuplicateList
        groups={[{ normalizedUrl: 'https://u.test/', keeper: rec('a', 'A', []), duplicates: [rec('b', 'B', [])] }]}
      />,
    );
    expect(screen.queryByRole('button')).toBeNull();
  });
});
