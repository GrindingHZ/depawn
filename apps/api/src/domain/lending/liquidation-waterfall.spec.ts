import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { platformAccountIds } from '../ledger/platform-accounts';
import type { ProtocolParameters } from '../marketplace/protocol-parameters';
import { accountIdOf } from '../shared/identifiers';
import { Money, currencyOf } from '../shared/money';
import type { Distribution } from '../shared/settlement-ref';
import { distributeLiquidationProceeds } from './liquidation-waterfall';

const aud = currencyOf('AUD');
const recipients = {
  noteHolder: accountIdOf('LENDER-1'),
  borrower: accountIdOf('BORROWER-1'),
};

const parameters = {
  liquidationFeeBasisPoints: 500,
} as ProtocolParameters;

function sumOf(distributions: readonly Distribution[]): bigint {
  return distributions.reduce((total, distribution) => total + distribution.amount.minorUnits, 0n);
}

function amountFor(distributions: readonly Distribution[], accountId: string): bigint {
  return distributions
    .filter((distribution) => distribution.accountId === accountId)
    .reduce((total, distribution) => total + distribution.amount.minorUnits, 0n);
}

describe('distributeLiquidationProceeds', () => {
  it('pays the lender, takes a fee, and returns the surplus when the sale beats the debt', () => {
    const distributions = distributeLiquidationProceeds(
      Money.of(300_000n, aud),
      Money.of(250_000n, aud),
      recipients,
      parameters,
    );

    expect(amountFor(distributions, 'LENDER-1')).toBe(250_000n);
    // 500 basis points of the 50000 remainder.
    expect(amountFor(distributions, platformAccountIds.feeRevenue)).toBe(2_500n);
    expect(amountFor(distributions, 'BORROWER-1')).toBe(47_500n);
    expect(sumOf(distributions)).toBe(300_000n);
  });

  it('gives the lender everything and nobody else anything when the sale falls short', () => {
    const distributions = distributeLiquidationProceeds(
      Money.of(200_000n, aud),
      Money.of(250_000n, aud),
      recipients,
      parameters,
    );

    expect(amountFor(distributions, 'LENDER-1')).toBe(200_000n);
    // No remainder means no fee on nothing and no surplus to return.
    expect(amountFor(distributions, platformAccountIds.feeRevenue)).toBe(0n);
    expect(amountFor(distributions, 'BORROWER-1')).toBe(0n);
    expect(sumOf(distributions)).toBe(200_000n);
  });

  it('leaves nothing over when the sale matches the debt exactly', () => {
    const distributions = distributeLiquidationProceeds(
      Money.of(250_000n, aud),
      Money.of(250_000n, aud),
      recipients,
      parameters,
    );

    expect(amountFor(distributions, 'LENDER-1')).toBe(250_000n);
    expect(amountFor(distributions, platformAccountIds.feeRevenue)).toBe(0n);
    expect(amountFor(distributions, 'BORROWER-1')).toBe(0n);
    expect(sumOf(distributions)).toBe(250_000n);
  });

  it('always carries the rounding line, even at zero', () => {
    const distributions = distributeLiquidationProceeds(
      Money.of(300_000n, aud),
      Money.of(250_000n, aud),
      recipients,
      parameters,
    );
    const rounding = distributions.filter(
      (distribution) => distribution.accountId === platformAccountIds.rounding,
    );
    expect(rounding).toHaveLength(1);
    expect(rounding[0]?.amount.minorUnits).toBe(0n);
  });

  it('routes a truncated minor unit to rounding rather than losing it', () => {
    // A remainder of 1 at 500 basis points truncates the fee to zero, so the
    // surplus takes the whole unit and rounding stays empty. The property
    // test below is what proves no arrangement can leak one.
    const distributions = distributeLiquidationProceeds(
      Money.of(250_001n, aud),
      Money.of(250_000n, aud),
      recipients,
      parameters,
    );
    expect(sumOf(distributions)).toBe(250_001n);
  });

  it('sums to the proceeds for any sale against any debt', () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: 0n, max: 1_000_000_000_000n }),
        fc.bigInt({ min: 1n, max: 1_000_000_000_000n }),
        fc.integer({ min: 0, max: 10_000 }),
        (proceeds, owed, feeBasisPoints) => {
          const distributions = distributeLiquidationProceeds(
            Money.of(proceeds, aud),
            Money.of(owed, aud),
            recipients,
            { liquidationFeeBasisPoints: feeBasisPoints } as ProtocolParameters,
          );
          expect(sumOf(distributions)).toBe(proceeds);
          for (const distribution of distributions) {
            expect(distribution.amount.isNegative()).toBe(false);
          }
        },
      ),
      { numRuns: 500 },
    );
  });
});
