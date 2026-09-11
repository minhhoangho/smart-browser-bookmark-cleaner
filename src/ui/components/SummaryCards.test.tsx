import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import SummaryCards from './SummaryCards';

describe('SummaryCards', () => {
  it('shows each headline number with its label', () => {
    render(
      <SummaryCards
        totalBookmarks={1204}
        redundantCount={37}
        emptyFolderCount={5}
        unscannableCount={2}
      />,
    );

    expect(screen.getByText('1204')).toBeTruthy();
    expect(screen.getByText('37')).toBeTruthy();
    expect(screen.getByText(/redundant copies/i)).toBeTruthy();
    expect(screen.getByText(/empty folders/i)).toBeTruthy();
  });
});
