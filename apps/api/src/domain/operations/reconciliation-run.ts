import type { ReceiptId, ReconciliationRunId, VaultId } from '../shared/identifiers';
import type { Instant } from '../shared/instant';
import type { Money } from '../shared/money';

export type DriftKind =
  | 'MISSING_FROM_COUNT'
  | 'MISSING_FROM_RECORDS'
  | 'LEDGER_TRANSACTION_IMBALANCE'
  | 'LEDGER_GLOBAL_IMBALANCE';

/* A drift row names the thing to go and look at, not a total. Drift is an
   incident routed to a human (docs/10-flows.md flow 10), so the row carries
   both values rather than the difference between them. */
export interface DriftRow {
  readonly kind: DriftKind;
  readonly subject: string;
  readonly field: string;
  readonly expected: string;
  readonly observed: string;
}

export interface VaultCount {
  readonly vaultId: VaultId;
  readonly countedReceiptIds: readonly ReceiptId[];
}

export interface RecordedInventory {
  readonly vaultId: VaultId;
  readonly receiptIds: readonly ReceiptId[];
}

export interface LedgerTransactionBalance {
  readonly ledgerTransactionId: string;
  readonly net: Money;
}

export interface ReconciliationRun {
  readonly id: ReconciliationRunId;
  readonly vaultId: VaultId | null;
  readonly startedAt: Instant;
  readonly drift: readonly DriftRow[];
}

/* Compares what the operator physically counted against what the database
   believes is in the vault. Both directions matter: an item the records
   forgot is as much an incident as one that has walked. */
export function detectInventoryDrift(counted: VaultCount, recorded: RecordedInventory): DriftRow[] {
  const countedSet = new Set<string>(counted.countedReceiptIds);
  const recordedSet = new Set<string>(recorded.receiptIds);

  const drift: DriftRow[] = [];
  for (const receiptId of recorded.receiptIds) {
    if (!countedSet.has(receiptId)) {
      drift.push({
        kind: 'MISSING_FROM_COUNT',
        subject: receiptId,
        field: 'presence',
        expected: 'in the vault',
        observed: 'not counted',
      });
    }
  }
  for (const receiptId of counted.countedReceiptIds) {
    if (!recordedSet.has(receiptId)) {
      drift.push({
        kind: 'MISSING_FROM_RECORDS',
        subject: receiptId,
        field: 'presence',
        expected: 'not in the vault',
        observed: 'counted',
      });
    }
  }
  return drift;
}

/* The ledger half of flow 10. Balances were never stored, so there is no
   second copy to reconcile against: comparing a derived balance with a sum
   of the same entries would compare a number with itself and pass forever.
   What can actually be wrong is the invariant every write upholds, so that
   is what this checks: each transaction balances, and the whole sums to
   zero (docs/03-ledger-and-money.md). */
export function detectLedgerDrift(
  transactions: readonly LedgerTransactionBalance[],
  globalSum: Money,
): DriftRow[] {
  const drift: DriftRow[] = [];
  for (const transaction of transactions) {
    if (!transaction.net.isZero()) {
      drift.push({
        kind: 'LEDGER_TRANSACTION_IMBALANCE',
        subject: transaction.ledgerTransactionId,
        field: 'net',
        expected: '0',
        observed: transaction.net.minorUnits.toString(),
      });
    }
  }
  if (!globalSum.isZero()) {
    drift.push({
      kind: 'LEDGER_GLOBAL_IMBALANCE',
      subject: 'ledger',
      field: 'sum',
      expected: '0',
      observed: globalSum.minorUnits.toString(),
    });
  }
  return drift;
}
