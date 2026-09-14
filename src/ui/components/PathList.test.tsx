import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import PathList from './PathList';
import type { PathListItem } from './PathList';

function item(over: Partial<PathListItem> & Pick<PathListItem, 'id'>): PathListItem {
  return { title: 'Example', path: ['Bookmarks bar'], ...over };
}

describe('PathList', () => {
  it('renders an empty state when there is nothing to show', () => {
    render(<PathList items={[]} emptyMessage="Nothing to show." />);
    expect(screen.getByText('Nothing to show.')).toBeTruthy();
  });

  it('renders a normal item with its title and folder path', () => {
    render(
      <PathList
        items={[item({ id: 'a', title: 'Docs', path: ['Bookmarks bar', 'Dev'] })]}
        emptyMessage="Nothing to show."
      />,
    );
    expect(screen.getByText('Docs')).toBeTruthy();
    expect(screen.getByText('Bookmarks bar / Dev')).toBeTruthy();
  });

  it('falls back to (untitled) for an empty title', () => {
    render(
      <PathList items={[item({ id: 'a', title: '' })]} emptyMessage="Nothing to show." />,
    );
    expect(screen.getByText('(untitled)')).toBeTruthy();
  });

  it('falls back to (top level) for an empty path', () => {
    render(
      <PathList items={[item({ id: 'a', path: [] })]} emptyMessage="Nothing to show." />,
    );
    expect(screen.getByText('(top level)')).toBeTruthy();
  });

  it('renders detail when present and omits it when absent', () => {
    const { rerender } = render(
      <PathList
        items={[item({ id: 'a', detail: 'https://example.com/' })]}
        emptyMessage="Nothing to show."
      />,
    );
    expect(screen.getByText('https://example.com/')).toBeTruthy();

    rerender(<PathList items={[item({ id: 'a' })]} emptyMessage="Nothing to show." />);
    expect(screen.queryByText('https://example.com/')).toBeNull();
  });

  it('shows no Show in Chrome control without a handler', () => {
    render(<PathList items={[item({ id: 'a', folderId: '1' })]} emptyMessage="Nothing to show." />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('shows no Show in Chrome control for an item without a folder', () => {
    render(<PathList items={[item({ id: 'a' })]} emptyMessage="Nothing to show." onOpenFolder={vi.fn()} />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it("opens the item's folder when Show in Chrome is clicked", () => {
    const onOpenFolder = vi.fn();
    render(
      <PathList
        items={[item({ id: 'a', title: 'Docs', path: ['Bookmarks bar', 'Dev'], folderId: 'dev-folder' })]}
        emptyMessage="Nothing to show."
        onOpenFolder={onOpenFolder}
      />,
    );
    screen.getByRole('button', { name: 'Show "Docs" (Bookmarks bar / Dev) in Chrome' }).click();
    expect(onOpenFolder).toHaveBeenCalledWith('dev-folder');
  });
});
