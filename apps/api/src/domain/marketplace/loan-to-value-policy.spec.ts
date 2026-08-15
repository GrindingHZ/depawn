import { describe, expect, it } from 'vitest';
import { Money, currencyOf } from '../shared/money';
import { assertWithinLoanToValue } from './loan-to-value-policy';
import type { ProtocolParameters } from './protocol-parameters';

const aud = currencyOf('AUD');

const parameters: ProtocolParameters = {
  maxLoanToValueBasisPointsByCategory: { BULLION: 6000 },
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
});
