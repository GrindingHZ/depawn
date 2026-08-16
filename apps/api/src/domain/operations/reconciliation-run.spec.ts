import { describe, expect, it } from 'vitest';
import { receiptIdOf, vaultIdOf } from '../shared/identifiers';
import { Money, currencyOf } from '../shared/money';
import { detectInventoryDrift, detectLedgerDrift } from './reconciliation-run';

const aud = currencyOf('AUD');
const vaultId = vaultIdOf('VAULT-1');

describe('detectInventoryDrift', () => {
  it('reports nothing when the count matches the records', () => {
    const drift = detectInventoryDrift(
      { vaultId, countedReceiptIds: [receiptIdOf('R1'), receiptIdOf('R2')] },
      { vaultId, receiptIds: [receiptIdOf('R1'), receiptIdOf('R2')] },
    );
    expect(drift).toEqual([]);
  });

  it('reports an item the records expect but the count did not find', () => {
    const drift = detectInventoryDrift(
      { vaultId, countedReceiptIds: [receiptIdOf('R1')] },
      { vaultId, receiptIds: [receiptIdOf('R1'), receiptIdOf('R2')] },
    );
    expect(drift).toHaveLength(1);
    expect(drift[0]?.kind).toBe('MISSING_FROM_COUNT');
    expect(drift[0]?.subject).toBe('R2');
  });

  it('reports an item the count found that the records do not know', () => {
    const drift = detectInventoryDrift(
      { vaultId, countedReceiptIds: [receiptIdOf('R1'), receiptIdOf('R9')] },
      { vaultId, receiptIds: [receiptIdOf('R1')] },
    );
    expect(drift).toHaveLength(1);
    expect(drift[0]?.kind).toBe('MISSING_FROM_RECORDS');
    expect(drift[0]?.subject).toBe('R9');
  });

  it('reports both directions at once', () => {
    const drift = detectInventoryDrift(
      { vaultId, countedReceiptIds: [receiptIdOf('R9')] },
      { vaultId, receiptIds: [receiptIdOf('R1')] },
    );
    expect(drift.map((row) => row.kind).sort()).toEqual([
      'MISSING_FROM_COUNT',
      'MISSING_FROM_RECORDS',
    ]);
  });

  it('carries both values so a human knows what to look at', () => {
    const drift = detectInventoryDrift(
      { vaultId, countedReceiptIds: [] },
      { vaultId, receiptIds: [receiptIdOf('R2')] },
    );
    expect(drift[0]?.field).toBe('presence');
    expect(drift[0]?.expected).toBe('in the vault');
    expect(drift[0]?.observed).toBe('not counted');
  });
});

describe('detectLedgerDrift', () => {
  it('reports nothing when every account agrees and the whole sums to zero', () => {
    const drift = detectLedgerDrift(
      [
        {
          ledgerAccountId: 'A',
          derivedBalance: Money.of(100n, aud),
          entrySum: Money.of(100n, aud),
        },
      ],
      Money.zero(aud),
    );
    expect(drift).toEqual([]);
  });

  it('reports an account whose balance disagrees with its entries', () => {
    const drift = detectLedgerDrift(
      [{ ledgerAccountId: 'A', derivedBalance: Money.of(100n, aud), entrySum: Money.of(99n, aud) }],
      Money.zero(aud),
    );
    expect(drift).toHaveLength(1);
    expect(drift[0]?.kind).toBe('LEDGER_ACCOUNT_IMBALANCE');
    expect(drift[0]?.expected).toBe('100');
    expect(drift[0]?.observed).toBe('99');
  });

  it('reports a ledger that does not sum to zero', () => {
    const drift = detectLedgerDrift([], Money.of(-5n, aud));
    expect(drift).toHaveLength(1);
    expect(drift[0]?.kind).toBe('LEDGER_GLOBAL_IMBALANCE');
    expect(drift[0]?.observed).toBe('-5');
  });
});
