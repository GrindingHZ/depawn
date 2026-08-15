import { describe, expect, it } from 'vitest';
import { Instant } from '../shared/instant';
import { Money, currencyOf } from '../shared/money';
import { MILLISECONDS_PER_YEAR, calculateAccruedInterest } from './interest-calculator';

const aud = currencyOf('AUD');
const startedAt = Instant.fromEpochMilliseconds(1_700_000_000_000n);
const oneDay = 24n * 60n * 60n * 1000n;
const maturesAt = startedAt.plusMilliseconds(30n * oneDay);

function interestAt(now: Instant, principal = Money.of(250_000n, aud), rate = 1_800): Money {
  return calculateAccruedInterest(principal, rate, startedAt, maturesAt, now);
}

describe('calculateAccruedInterest', () => {
  it('returns zero at the moment of origination', () => {
    expect(interestAt(startedAt).minorUnits).toBe(0n);
  });

  it('accrues linearly through the term', () => {
    const tenDays = interestAt(startedAt.plusMilliseconds(10n * oneDay)).minorUnits;
    const twentyDays = interestAt(startedAt.plusMilliseconds(20n * oneDay)).minorUnits;
    expect(tenDays).toBeGreaterThan(0n);
    // Truncation can cost a minor unit, so the doubling is exact to within one.
    expect(twentyDays - tenDays * 2n).toBeLessThanOrEqual(1n);
    expect(twentyDays - tenDays * 2n).toBeGreaterThanOrEqual(-1n);
  });

  it('matches the closed form over a full year', () => {
    const yearStart = Instant.fromEpochMilliseconds(0n);
    const yearEnd = yearStart.plusMilliseconds(MILLISECONDS_PER_YEAR);
    const interest = calculateAccruedInterest(
      Money.of(1_000_000n, aud),
      1_800,
      yearStart,
      yearEnd,
      yearEnd,
    );
    expect(interest.minorUnits).toBe(180_000n);
  });

  it('stops accruing at maturity', () => {
    const atMaturity = interestAt(maturesAt).minorUnits;
    const wellPast = interestAt(maturesAt.plusMilliseconds(90n * oneDay)).minorUnits;
    expect(wellPast).toBe(atMaturity);
  });

  it('accrues nothing before origination', () => {
    expect(interestAt(startedAt.plusMilliseconds(-oneDay)).minorUnits).toBe(0n);
  });

  it('truncates in the borrower favour', () => {
    // One minor unit for one hour at one basis point cannot reach a whole
    // minor unit, so the exact figure is a fraction and the result is zero.
    const oneHour = 60n * 60n * 1000n;
    const interest = calculateAccruedInterest(
      Money.of(1n, aud),
      1,
      startedAt,
      maturesAt,
      startedAt.plusMilliseconds(oneHour),
    );
    expect(interest.minorUnits).toBe(0n);
  });

  it('does not overflow on a large principal held for a full term', () => {
    const largePrincipal = Money.of(10_000_000_000n, aud);
    const yearStart = Instant.fromEpochMilliseconds(0n);
    const yearEnd = yearStart.plusMilliseconds(MILLISECONDS_PER_YEAR);
    const interest = calculateAccruedInterest(largePrincipal, 2_400, yearStart, yearEnd, yearEnd);
    expect(interest.minorUnits).toBe(2_400_000_000n);
    // The intermediate product passes far beyond a 64 bit integer, which is
    // why every step stays in bigint.
    expect(largePrincipal.minorUnits * 2_400n * MILLISECONDS_PER_YEAR).toBeGreaterThan(2n ** 64n);
  });

  it('rejects a negative rate', () => {
    expect(() => interestAt(maturesAt, Money.of(1_000n, aud), -1)).toThrow(RangeError);
  });

  it('keeps the principal currency', () => {
    expect(interestAt(maturesAt).currency).toBe(aud);
  });
});
