import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
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
});
