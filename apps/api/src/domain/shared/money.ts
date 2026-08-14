import type { Brand } from './brand';

export type Currency = Brand<string, 'Currency'>;

export function currencyOf(code: string): Currency {
  return code as Currency;
}

export class CurrencyMismatchError extends Error {
  constructor(left: Currency, right: Currency) {
    super(`Cannot operate across currencies ${left} and ${right}`);
    this.name = 'CurrencyMismatchError';
  }
}

export class Money {
  private constructor(
    readonly minorUnits: bigint,
    readonly currency: Currency,
  ) {}

  static of(minorUnits: bigint, currency: Currency): Money {
    return new Money(minorUnits, currency);
  }

  static zero(currency: Currency): Money {
    return new Money(0n, currency);
  }

  plus(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this.minorUnits + other.minorUnits, this.currency);
  }

  minus(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this.minorUnits - other.minorUnits, this.currency);
  }

  multiplyByBasisPoints(basisPoints: number): Money {
    if (!Number.isInteger(basisPoints) || basisPoints < 0) {
      throw new RangeError(`Basis points must be a non-negative integer, got ${basisPoints}`);
    }
    // Truncating division rounds down deliberately; settlement routes any
    // remainder to the platform rounding account so nothing vanishes.
    return new Money((this.minorUnits * BigInt(basisPoints)) / 10_000n, this.currency);
  }

  isGreaterThan(other: Money): boolean {
    this.assertSameCurrency(other);
    return this.minorUnits > other.minorUnits;
  }

  isLessThan(other: Money): boolean {
    this.assertSameCurrency(other);
    return this.minorUnits < other.minorUnits;
  }

  equals(other: Money): boolean {
    return this.currency === other.currency && this.minorUnits === other.minorUnits;
  }

  isZero(): boolean {
    return this.minorUnits === 0n;
  }

  isNegative(): boolean {
    return this.minorUnits < 0n;
  }

  private assertSameCurrency(other: Money): void {
    if (this.currency !== other.currency) {
      throw new CurrencyMismatchError(this.currency, other.currency);
    }
  }
}
