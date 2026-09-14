import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ShowInChromeButton from './ShowInChromeButton';

describe('ShowInChromeButton', () => {
  it('names the item it acts on, for screen readers', () => {
    render(<ShowInChromeButton label='"Docs" (Bookmarks bar)' folderId="1" onOpenFolder={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Show "Docs" (Bookmarks bar) in Chrome' })).toBeTruthy();
  });

  it('passes its folder id when clicked', () => {
    const onOpenFolder = vi.fn();
    render(<ShowInChromeButton label="x" folderId="42" onOpenFolder={onOpenFolder} />);
    screen.getByRole('button').click();
    expect(onOpenFolder).toHaveBeenCalledWith('42');
  });
});
