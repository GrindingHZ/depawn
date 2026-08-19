import { describe, expect, it } from 'vitest';
import { positionOf } from './market-role';

const base = {
  borrowerAccountId: 'ada',
  viewerAccountId: 'gita',
  hasLiveOffer: false,
  hasFundedLoan: false,
};

describe('positionOf', () => {
  it('reads the listing owner as the borrower', () => {
    expect(positionOf({ ...base, viewerAccountId: 'ada' })).toEqual({
      role: 'borrower',
      relationship: 'borrower',
    });
  });

  it('reads somebody with a live offer as a lender who has offered', () => {
    expect(positionOf({ ...base, hasLiveOffer: true })).toEqual({
      role: 'lender',
      relationship: 'offered',
    });
  });

  it('reads the funder as a lender who funded it', () => {
    expect(positionOf({ ...base, hasFundedLoan: true })).toEqual({
      role: 'lender',
      relationship: 'funded',
    });
  });

  it('reads a passer by as a lender with no stake', () => {
    expect(positionOf(base)).toEqual({ role: 'lender', relationship: 'none' });
  });

  /* The ambiguous case named in the design. Somebody who lends elsewhere and
     borrows here is the borrower on this listing, and being told otherwise
     would invert every colour on the screen. */
  it('keeps the borrower as the borrower even when they also lend', () => {
    expect(
      positionOf({
        ...base,
        viewerAccountId: 'ada',
        hasLiveOffer: true,
        hasFundedLoan: true,
      }),
    ).toEqual({ role: 'borrower', relationship: 'borrower' });
  });

  it('ranks a funded loan above a live offer', () => {
    expect(positionOf({ ...base, hasLiveOffer: true, hasFundedLoan: true }).relationship).toBe(
      'funded',
    );
  });

  it('treats a signed out reader as a lender with no stake', () => {
    expect(positionOf({ ...base, viewerAccountId: null })).toEqual({
      role: 'lender',
      relationship: 'none',
    });
  });
});
