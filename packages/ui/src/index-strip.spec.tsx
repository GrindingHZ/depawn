import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { IndexStrip } from './index-strip';
import type { IndexEntry } from './index-strip';

const entries: IndexEntry[] = [
  {
    category: 'BULLION',
    categoryName: 'Bullion',
    liveListings: 3,
    averageRateBasisPoints: 840,
    previousAverageRateBasisPoints: 900,
  },
  {
    category: 'WATCH',
    categoryName: 'Watch',
    liveListings: 2,
    averageRateBasisPoints: 1120,
    previousAverageRateBasisPoints: 1050,
  },
];

describe('IndexStrip', () => {
  it('names every category and how many are live', () => {
    render(<IndexStrip entries={entries} role="lender" />);
    expect(screen.getByText('Bullion')).toBeTruthy();
    expect(screen.getByText('3 live')).toBeTruthy();
  });

  /* The strip carries a delta per category, so it inherits the role rule
     wholesale: a category getting cheaper is good news to exactly one side. */
  it('reads a falling category two ways', () => {
    const { container, unmount } = render(<IndexStrip entries={entries} role="borrower" />);
    expect(container.querySelector('[data-tone="favourable"]')).toBeTruthy();
    unmount();

    const lender = render(<IndexStrip entries={entries} role="lender" />);
    expect(lender.container.querySelector('[data-tone="adverse"]')).toBeTruthy();
  });

  it('says no offers rather than showing a rate of zero', () => {
    render(
      <IndexStrip
        entries={[{ ...entries[0], averageRateBasisPoints: null } as IndexEntry]}
        role="lender"
      />,
    );
    expect(screen.getByText('no offers')).toBeTruthy();
  });

  it('reports the category the reader picked', () => {
    const onSelectCategory = vi.fn();
    render(<IndexStrip entries={entries} role="lender" onSelectCategory={onSelectCategory} />);
    fireEvent.click(screen.getByText('Bullion'));
    expect(onSelectCategory).toHaveBeenCalledWith('BULLION');
  });

  /* Clicking the category you are already filtered to is how you stop
     filtering, so the same control has to be able to clear itself. */
  it('clears the filter when the selected category is picked again', () => {
    const onSelectCategory = vi.fn();
    render(
      <IndexStrip
        entries={entries}
        role="lender"
        selectedCategory="BULLION"
        onSelectCategory={onSelectCategory}
      />,
    );
    fireEvent.click(screen.getByText('Bullion'));
    expect(onSelectCategory).toHaveBeenCalledWith(null);
  });

  /* It is a convenience, not a dependency. When the query returns nothing it
     leaves no gap behind. */
  it('renders nothing at all when there is no market', () => {
    const { container } = render(<IndexStrip entries={[]} role="lender" />);
    expect(container.firstChild).toBeNull();
  });
});
