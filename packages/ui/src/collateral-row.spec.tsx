import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CollateralCard, CollateralRow } from './collateral-row';
import type { CollateralItem } from './collateral-row';

const item: CollateralItem = {
  listingId: '01JQF',
  itemDescription: 'Rolex Submariner 116610LN',
  itemCategory: 'WATCH',
  categoryName: 'Watch',
  appraisedValue: { minorUnits: '1380000', currency: 'AUD' },
  requestedPrincipal: { minorUnits: '800000', currency: 'AUD' },
  loanToValueBasisPoints: 5797,
  bestRateBasisPoints: 1120,
  closesIn: 'closes in 2h 14m',
  photographSrc: '/api/v1/receipts/r1/photo',
  relationship: 'none',
};

describe('CollateralRow', () => {
  /* The identity choice made in brainstorming: the description, never an id.
     A ULID tells a lender nothing about what they would be lending against. */
  it('leads with the item, not an identifier', () => {
    render(<CollateralRow item={item} />);
    expect(screen.getByText('Rolex Submariner 116610LN')).toBeTruthy();
    expect(screen.queryByText('01JQF')).toBeNull();
  });

  it('shows the photograph with the item as its description', () => {
    render(<CollateralRow item={item} />);
    expect(screen.getByAltText('Rolex Submariner 116610LN')).toBeTruthy();
  });

  it('holds the photograph space when there is no photograph', () => {
    const { container } = render(<CollateralRow item={{ ...item, photographSrc: null }} />);
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('[aria-hidden="true"]')).toBeTruthy();
  });

  it('shows the rate, the loan to value and when it closes', () => {
    render(<CollateralRow item={item} />);
    expect(screen.getByText('11.20%')).toBeTruthy();
    expect(screen.getByText('closes in 2h 14m')).toBeTruthy();
  });

  it('says so rather than showing a rate when nobody has offered', () => {
    render(<CollateralRow item={{ ...item, bestRateBasisPoints: null }} />);
    expect(screen.getByText('no offers')).toBeTruthy();
  });

  it('names the reader relationship in words', () => {
    const { unmount } = render(<CollateralRow item={{ ...item, relationship: 'borrower' }} />);
    expect(screen.getByText('yours')).toBeTruthy();
    unmount();

    const offered = render(<CollateralRow item={{ ...item, relationship: 'offered' }} />);
    expect(offered.getByText('you offered')).toBeTruthy();
    offered.unmount();

    render(<CollateralRow item={{ ...item, relationship: 'funded' }} />);
    expect(screen.getByText('you funded')).toBeTruthy();
  });

  it('says nothing about a listing the reader has no stake in', () => {
    render(<CollateralRow item={item} />);
    expect(screen.queryByText('yours')).toBeNull();
    expect(screen.queryByText('you offered')).toBeNull();
  });

  it('reports which listing was chosen', () => {
    const onSelect = vi.fn();
    render(<CollateralRow item={item} onSelect={onSelect} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onSelect).toHaveBeenCalledWith('01JQF');
  });

  it('marks selection for assistive technology, not only with a colour', () => {
    render(<CollateralRow item={item} isSelected />);
    expect(screen.getByRole('button').getAttribute('aria-pressed')).toBe('true');
  });
});

describe('CollateralCard', () => {
  it('shows the same item with a larger photograph', () => {
    const { container } = render(<CollateralCard item={item} />);
    expect(screen.getByText('Rolex Submariner 116610LN')).toBeTruthy();
    expect(container.querySelector('img')?.getAttribute('class')).toContain('h-40');
  });

  it('reports which listing was chosen', () => {
    const onSelect = vi.fn();
    render(<CollateralCard item={item} onSelect={onSelect} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onSelect).toHaveBeenCalledWith('01JQF');
  });

  it('marks selection for assistive technology', () => {
    render(<CollateralCard item={item} isSelected />);
    expect(screen.getByRole('button').getAttribute('aria-pressed')).toBe('true');
  });
});
