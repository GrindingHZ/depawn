import type { ReactElement } from 'react';
import { formatRate } from './rate';

/* Which side of a listing the reader is on. Derived from their relationship
   to it rather than chosen, so there is no control to leave in the wrong
   position. */
export type MarketRole = 'borrower' | 'lender';

export type MarketDirection = 'down' | 'up' | 'flat';

export type MarketTone = 'favourable' | 'adverse' | 'flat';

export interface MarketDeltaProps {
  readonly currentBasisPoints: number;
  /* Null when there is nothing to compare against, which is a first offer
     rather than a rate that held steady. Both render flat; only one of them
     is a statement about the market. */
  readonly previousBasisPoints: number | null;
  readonly role: MarketRole;
  readonly label?: string;
}

export function directionOf(current: number, previous: number | null): MarketDirection {
  if (previous === null || current === previous) {
    return 'flat';
  }
  return current < previous ? 'down' : 'up';
}

/* The one rule this component exists for. A rate falling is the borrower
   paying less and the lender being undercut: identical arithmetic, opposite
   news. Every trading screen paints falling red for everybody, which would
   tell half of this product's users the reverse of what happened to their own
   money. So the table is indexed by who is reading. */
const tones: Record<MarketRole, Record<MarketDirection, MarketTone>> = {
  borrower: { down: 'favourable', up: 'adverse', flat: 'flat' },
  lender: { down: 'adverse', up: 'favourable', flat: 'flat' },
};

export function toneFor(direction: MarketDirection, role: MarketRole): MarketTone {
  return tones[role][direction];
}

const arrows: Record<MarketDirection, string> = { down: '▼', up: '▲', flat: '▬' };

const toneClasses: Record<MarketTone, string> = {
  favourable: 'text-market-favourable',
  adverse: 'text-market-adverse',
  flat: 'text-market-flat',
};

/* Colour is never the only signal, so the movement is also stated in words.
   The words differ by role for the same reason the colour does. */
const readings: Record<MarketRole, Record<MarketDirection, string>> = {
  borrower: {
    down: 'cheaper for you than the last offer',
    up: 'dearer for you than the last offer',
    flat: 'no offer to compare against yet',
  },
  lender: {
    down: 'you have been undercut',
    up: 'you are no longer the cheapest',
    flat: 'no offer to compare against yet',
  },
};

export function MarketDelta({
  currentBasisPoints,
  previousBasisPoints,
  role,
  label,
}: MarketDeltaProps): ReactElement {
  const direction = directionOf(currentBasisPoints, previousBasisPoints);
  const tone = toneFor(direction, role);

  return (
    <span className="inline-flex flex-col gap-1">
      {label === undefined ? null : (
        <span className="font-body text-xs text-ink-secondary">{label}</span>
      )}
      <span
        data-tone={tone}
        data-direction={direction}
        className={`inline-flex items-baseline gap-2 font-mono tabular-nums ${toneClasses[tone]}`}
      >
        <span aria-hidden="true">{arrows[direction]}</span>
        <span>{formatPercentage(currentBasisPoints)}</span>
      </span>
      <span className="font-body text-xs text-ink-secondary">{readings[role][direction]}</span>
    </span>
  );
}

/* Rate renders "11.20% p.a." because a loan is quoted per annum. On a book
   where every row is per annum the suffix is noise repeated forty times, so
   the figure alone is used and the column says it once. */
function formatPercentage(basisPoints: number): string {
  return formatRate(basisPoints).replace(' p.a.', '');
}
