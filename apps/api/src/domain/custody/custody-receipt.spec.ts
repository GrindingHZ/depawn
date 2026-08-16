import { describe, expect, it } from 'vitest';
import { accountIdOf, loanIdOf, receiptIdOf, staffIdOf, vaultIdOf } from '../shared/identifiers';
import { Instant } from '../shared/instant';
import { Money, currencyOf } from '../shared/money';
import { CustodyReceipt, allowedReceiptTransitions } from './custody-receipt';
import type { ReceiptEvent, ReceiptStatus } from './custody-receipt';
import type { Result } from '../shared/result';
import type { DomainError } from '../shared/domain-error';

const aud = currencyOf('AUD');

function receiptIn(status: ReceiptStatus): CustodyReceipt {
  return CustodyReceipt.restore({
    id: receiptIdOf('R1'),
    vaultId: vaultIdOf('V1'),
    holderAccountId: accountIdOf('A1'),
    intakeRecordHash: 'hash',
    appraisedValue: Money.of(500_000n, aud),
    appraisedAt: Instant.fromEpochMilliseconds(1_700_000_000_000n),
    appraiserId: staffIdOf('S1'),
    itemCategory: 'BULLION',
    itemDescription: 'One kilogram gold bar, cast',
    insurancePolicyReference: 'POL-1',
    status,
    encumberedByLoanId: status === 'ENCUMBERED' ? loanIdOf('L1') : null,
    version: 0,
  });
}

function apply(receipt: CustodyReceipt, event: ReceiptEvent): Result<CustodyReceipt, DomainError> {
  switch (event) {
    case 'encumber':
      return receipt.encumber(loanIdOf('L2'));
    case 'releaseEncumbrance':
      return receipt.releaseEncumbrance();
    case 'claimDefault':
      return receipt.claimDefault(accountIdOf('LENDER'));
    case 'transferHolder':
      return receipt.transferHolder(accountIdOf('A2'));
    case 'burnForRedemption':
      return receipt.burnForRedemption();
    case 'burnForLiquidation':
      return receipt.burnForLiquidation();
  }
}

const everyStatus: ReceiptStatus[] = ['IN_VAULT', 'ENCUMBERED', 'RELEASED', 'LIQUIDATED'];
const everyEvent: ReceiptEvent[] = [
  'encumber',
  'releaseEncumbrance',
  'claimDefault',
  'transferHolder',
  'burnForRedemption',
  'burnForLiquidation',
];

describe('CustodyReceipt transitions', () => {
  it('walks every state and event pair against the table', () => {
    for (const status of everyStatus) {
      for (const event of everyEvent) {
        const result = apply(receiptIn(status), event);
        const expected = allowedReceiptTransitions[status].includes(event);
        expect(result.ok, `${status} + ${event}`).toBe(expected);
      }
    }
  });

  it('keeps terminal states terminal', () => {
    expect(allowedReceiptTransitions.RELEASED).toHaveLength(0);
    expect(allowedReceiptTransitions.LIQUIDATED).toHaveLength(0);
  });

  it('binds the loan id while encumbered and clears it on release', () => {
    const encumbered = receiptIn('IN_VAULT').encumber(loanIdOf('L9'));
    expect(encumbered.ok).toBe(true);
    if (!encumbered.ok) {
      return;
    }
    expect(encumbered.value.status).toBe('ENCUMBERED');
    expect(encumbered.value.encumberedByLoanId).toBe('L9');

    const released = encumbered.value.releaseEncumbrance();
    expect(released.ok).toBe(true);
    if (released.ok) {
      expect(released.value.encumberedByLoanId).toBeNull();
      expect(released.value.status).toBe('IN_VAULT');
    }
  });

  it('hands the receipt to the claimant in vault after a default claim', () => {
    const claimed = receiptIn('ENCUMBERED').claimDefault(accountIdOf('LENDER'));
    expect(claimed.ok).toBe(true);
    if (claimed.ok) {
      expect(claimed.value.status).toBe('IN_VAULT');
      expect(claimed.value.holderAccountId).toBe('LENDER');
      expect(claimed.value.encumberedByLoanId).toBeNull();
    }
  });

  it('refuses to restore an inconsistent encumbrance', () => {
    expect(() =>
      CustodyReceipt.restore({
        id: receiptIdOf('R1'),
        vaultId: vaultIdOf('V1'),
        holderAccountId: accountIdOf('A1'),
        intakeRecordHash: 'hash',
        appraisedValue: Money.of(1n, aud),
        appraisedAt: Instant.fromEpochMilliseconds(0n),
        appraiserId: staffIdOf('S1'),
        itemCategory: 'BULLION',
        itemDescription: 'One kilogram gold bar, cast',
        insurancePolicyReference: 'POL-1',
        status: 'IN_VAULT',
        encumberedByLoanId: loanIdOf('L1'),
        version: 0,
      }),
    ).toThrow();
  });

  it('names the rejection after what actually blocks the move', () => {
    const whileEncumbered = receiptIn('ENCUMBERED').burnForRedemption();
    expect(whileEncumbered.ok).toBe(false);
    if (!whileEncumbered.ok) {
      expect(whileEncumbered.error.code).toBe('RECEIPT_ENCUMBERED');
    }

    const afterBurn = receiptIn('RELEASED').burnForRedemption();
    expect(afterBurn.ok).toBe(false);
    if (!afterBurn.ok) {
      expect(afterBurn.error.code).toBe('RECEIPT_ALREADY_BURNED');
    }
  });
});
