import { describe, expect, it } from 'vitest';
import { Money, currencyOf } from '../shared/money';
import { assertWithinInsuredLimit } from './vault-exposure-policy';

const aud = currencyOf('AUD');
const limit = Money.of(1_000_000n, aud);

describe('assertWithinInsuredLimit', () => {
  it('accepts exposure below the limit', () => {
    expect(
      assertWithinInsuredLimit(Money.of(400_000n, aud), Money.of(500_000n, aud), limit).ok,
    ).toBe(true);
  });

  it('accepts exposure exactly at the limit', () => {
    expect(
      assertWithinInsuredLimit(Money.of(400_000n, aud), Money.of(600_000n, aud), limit).ok,
    ).toBe(true);
  });

  it('rejects exposure one unit past the limit', () => {
    const result = assertWithinInsuredLimit(
      Money.of(400_000n, aud),
      Money.of(600_001n, aud),
      limit,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('VAULT_INSURED_LIMIT_EXCEEDED');
    }
  });
});
