import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Tape } from './tape';
import type { TapeItem } from './tape';

const items: TapeItem[] = [
  {
    at: '2026-08-19T11:59:59.000Z',
    kind: 'OFFER_PLACED',
    listingId: 'L1',
    itemDescription: 'Rolex Submariner 116610LN',
    rateBasisPoints: 1120,
    amount: { minorUnits: '800000', currency: 'AUD' },
  },
  {
    at: '2026-08-19T11:51:03.000Z',
    kind: 'LOAN_ORIGINATED',
    listingId: 'L2',
    itemDescription: 'Gold bar, 100g, PAMP Suisse',
    rateBasisPoints: 840,
    amount: { minorUnits: '550000', currency: 'AUD' },
  },
];

describe('Tape', () => {
  it('names the item rather than the listing id', () => {
    render(<Tape items={items} />);
    expect(screen.getByText('Rolex Submariner 116610LN')).toBeTruthy();
    expect(screen.queryByText('L1')).toBeNull();
  });

  it('keeps the order it was given, which is newest first', () => {
    const { container } = render(<Tape items={items} />);
    const rows = [...container.querySelectorAll('button')];
    expect(rows[0]?.textContent).toContain('Rolex');
    expect(rows[1]?.textContent).toContain('Gold bar');
  });

  it('says what happened in words, not with a colour', () => {
    render(<Tape items={items} />);
    expect(screen.getByText('offered')).toBeTruthy();
    expect(screen.getByText('funded')).toBeTruthy();
  });

  it('selects the listing behind a line', () => {
    const onSelectListing = vi.fn();
    render(<Tape items={items} onSelectListing={onSelectListing} />);
    fireEvent.click(screen.getByText('Rolex Submariner 116610LN'));
    expect(onSelectListing).toHaveBeenCalledWith('L1');
  });

  it('survives a timestamp it cannot read', () => {
    render(<Tape items={[{ ...items[0], at: 'not a date' } as TapeItem]} />);
    expect(screen.getByText('Rolex Submariner 116610LN')).toBeTruthy();
  });

  /* Announcing every offer would talk over a screen reader user who is
     trying to read the book. The tape is available, not insistent. */
  it('does not announce itself continuously', () => {
    const { container } = render(<Tape items={items} />);
    expect(container.querySelector('[role="log"]')?.getAttribute('aria-live')).toBe('off');
  });

  it('renders nothing at all when the market is quiet', () => {
    const { container } = render(<Tape items={[]} />);
    expect(container.firstChild).toBeNull();
  });
});
