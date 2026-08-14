import { describe, expect, it } from 'vitest';
import { CurrencyMismatchError, Money, currencyOf } from './money';

const aud = currencyOf('AUD');
const usd = currencyOf('USD');

describe('Money', () => {
  it('adds amounts of the same currency', () => {
    const sum = Money.of(1500n, aud).plus(Money.of(2500n, aud));
    expect(sum.minorUnits).toBe(4000n);
    expect(sum.currency).toBe(aud);
  });

  it('subtracts amounts of the same currency', () => {
    const difference = Money.of(2500n, aud).minus(Money.of(1500n, aud));
    expect(difference.minorUnits).toBe(1000n);
  });

  it('throws on arithmetic across currencies', () => {
    expect(() => Money.of(100n, aud).plus(Money.of(100n, usd))).toThrow(CurrencyMismatchError);
    expect(() => Money.of(100n, aud).minus(Money.of(100n, usd))).toThrow(CurrencyMismatchError);
    expect(() => Money.of(100n, aud).isGreaterThan(Money.of(100n, usd))).toThrow(
      CurrencyMismatchError,
    );
    expect(() => Money.of(100n, aud).isLessThan(Money.of(100n, usd))).toThrow(
      CurrencyMismatchError,
    );
  });

  it('multiplies by basis points with truncating division', () => {
    expect(Money.of(250_000n, aud).multiplyByBasisPoints(200).minorUnits).toBe(5000n);
    expect(Money.of(999n, aud).multiplyByBasisPoints(1).minorUnits).toBe(0n);
    expect(Money.of(10_001n, aud).multiplyByBasisPoints(50).minorUnits).toBe(50n);
  });

  it('rejects negative or fractional basis points', () => {
    expect(() => Money.of(100n, aud).multiplyByBasisPoints(-1)).toThrow(RangeError);
    expect(() => Money.of(100n, aud).multiplyByBasisPoints(2.5)).toThrow(RangeError);
  });

  it('does not overflow on large principals', () => {
    const large = Money.of(10_000_000_000n, aud);
    expect(large.multiplyByBasisPoints(4800).minorUnits).toBe(4_800_000_000n);
  });

  it('compares amounts of the same currency', () => {
    expect(Money.of(200n, aud).isGreaterThan(Money.of(100n, aud))).toBe(true);
    expect(Money.of(100n, aud).isLessThan(Money.of(200n, aud))).toBe(true);
    expect(Money.of(100n, aud).equals(Money.of(100n, aud))).toBe(true);
    expect(Money.of(100n, aud).equals(Money.of(100n, usd))).toBe(false);
  });

  it('recognises zero and negative amounts', () => {
    expect(Money.zero(aud).isZero()).toBe(true);
    expect(Money.of(1n, aud).isZero()).toBe(false);
    expect(Money.of(-1n, aud).isNegative()).toBe(true);
    expect(Money.zero(aud).isNegative()).toBe(false);
  });
});
