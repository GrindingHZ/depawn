import { describe, expect, it } from 'vitest';
import { accumulateDepth } from './offer-depth';

function offer(id: string, basisPoints: number, minorUnits: string) {
  return { id, annualPercentageRateBasisPoints: basisPoints, principal: { minorUnits } };
}

describe('accumulateDepth', () => {
  it('has no rows for an empty book', () => {
    expect(accumulateDepth([])).toEqual([]);
  });

  it('orders by rate ascending, because cheapest is best here', () => {
    const rows = accumulateDepth([
      offer('c', 1200, '250000'),
      offer('a', 1120, '800000'),
      offer('b', 1180, '500000'),
    ]);
    expect(rows.map((row) => row.offerId)).toEqual(['a', 'b', 'c']);
  });

  it('marks exactly one best row', () => {
    const rows = accumulateDepth([offer('a', 1120, '800000'), offer('b', 1180, '500000')]);
    expect(rows.filter((row) => row.isBest)).toHaveLength(1);
    expect(rows[0]?.isBest).toBe(true);
  });

  it('accumulates in bigint, so a book beyond the safe integer range still sums', () => {
    const rows = accumulateDepth([
      offer('a', 1000, '9007199254740993'),
      offer('b', 1100, '9007199254740993'),
    ]);
    expect(rows[1]?.cumulativeMinorUnits).toBe(18014398509481986n);
  });

  it('runs the cumulative total down the book', () => {
    const rows = accumulateDepth([
      offer('a', 1120, '800000'),
      offer('b', 1180, '500000'),
      offer('c', 1200, '250000'),
    ]);
    expect(rows.map((row) => row.cumulativeMinorUnits)).toEqual([800000n, 1300000n, 1550000n]);
  });

  /* The share is truncated to four decimal places by the bigint division that
     produces it. That is a hundredth of a percent of a bar nobody measures,
     and it keeps the arithmetic integer for as long as possible. Asserted
     exactly so the precision is a decision rather than an accident. */
  it('gives the deepest row the whole bar and truncates the rest to four places', () => {
    const rows = accumulateDepth([offer('a', 1120, '800000'), offer('b', 1180, '500000')]);
    expect(rows[1]?.cumulativeShare).toBe(1);
    expect(rows[0]?.cumulativeShare).toBe(0.6153);
  });

  it('keeps submission order when two lenders quote the same rate', () => {
    const rows = accumulateDepth([offer('first', 1120, '100000'), offer('second', 1120, '100000')]);
    expect(rows.map((row) => row.offerId)).toEqual(['first', 'second']);
  });

  it('leaves the caller array alone', () => {
    const input = [offer('c', 1200, '250000'), offer('a', 1120, '800000')];
    accumulateDepth(input);
    expect(input.map((row) => row.id)).toEqual(['c', 'a']);
  });

  it('does not divide by zero when every offer is for nothing', () => {
    const rows = accumulateDepth([offer('a', 1120, '0')]);
    expect(rows[0]?.cumulativeShare).toBe(0);
  });
});
