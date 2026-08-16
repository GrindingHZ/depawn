import { describe, expect, it } from 'vitest';
import { Money, currencyOf } from '../shared/money';
import { assertWithinLoanToValue } from './loan-to-value-policy';
import type { ProtocolParameters } from './protocol-parameters';

const aud = currencyOf('AUD');

const parameters: ProtocolParameters = {
  maxLoanToValueBasisPointsByCategory: {
    BULLION: 6000,
    WATCH: 5000,
    JEWELLERY: 4500,
    COLLECTIBLE: 3500,
    ART: 3000,
  },
  maxAnnualPercentageRateBasisPoints: 4800,
  minimumOfferLifetimeMs: 600_000n,
  originationFeeBasisPoints: 200,
  liquidationFeeBasisPoints: 300,
  gracePeriodMs: 604_800_000n,
  statutoryHoldingPeriodMs: 2_592_000_000n,
  dualAppraisalThreshold: Money.of(10_000_000n, aud),
  notesTransferable: false,
};

describe('assertWithinLoanToValue', () => {
  const appraisedValue = Money.of(500_000n, aud);

  it('accepts principal at the category cap', () => {
    expect(
      assertWithinLoanToValue(Money.of(300_000n, aud), appraisedValue, 'BULLION', parameters).ok,
    ).toBe(true);
  });

  it('rejects principal one unit past the cap with the maximum in the error', () => {
    const result = assertWithinLoanToValue(
      Money.of(300_001n, aud),
      appraisedValue,
      'BULLION',
      parameters,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('LOAN_TO_VALUE_EXCEEDED');
      expect(result.error.maxPrincipal.minorUnits).toBe(300_000n);
    }
  });

  /* The cap is the whole reason categories exist. A watch and a painting of
     the same appraised value do not support the same loan, because one of
     them can be sold this afternoon. */
  it.each([
    ['BULLION', 300_000n],
    ['WATCH', 250_000n],
    ['JEWELLERY', 225_000n],
    ['COLLECTIBLE', 175_000n],
    ['ART', 150_000n],
  ] as const)('caps %s at %s minor units of a 500000 appraisal', (category, cap) => {
    expect(
      assertWithinLoanToValue(Money.of(cap, aud), appraisedValue, category, parameters).ok,
    ).toBe(true);
    const past = assertWithinLoanToValue(
      Money.of(cap + 1n, aud),
      appraisedValue,
      category,
      parameters,
    );
    expect(past.ok).toBe(false);
  });

  /* A parameter set that has fallen behind the categories the vault accepts
     would otherwise put undefined into money arithmetic. */
  it('refuses to lend against a category nobody has priced', () => {
    const unpriced: ProtocolParameters = {
      ...parameters,
      maxLoanToValueBasisPointsByCategory: { ...parameters.maxLoanToValueBasisPointsByCategory },
    };
    delete (unpriced.maxLoanToValueBasisPointsByCategory as Record<string, number>).ART;

    expect(() =>
      assertWithinLoanToValue(Money.of(1n, aud), appraisedValue, 'ART', unpriced),
    ).toThrow('No loan to value cap is configured for ART');
  });
});
