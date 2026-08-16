import type { ReceiptId, ReconciliationRunId, VaultId } from '../shared/identifiers';
import type { Instant } from '../shared/instant';
import type { Money } from '../shared/money';

export type DriftKind =
  | 'MISSING_FROM_COUNT'
  | 'MISSING_FROM_RECORDS'
  | 'LEDGER_ACCOUNT_IMBALANCE'
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

export interface LedgerAccountBalance {
  readonly ledgerAccountId: string;
  readonly derivedBalance: Money;
  readonly entrySum: Money;
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

/* The ledger half of flow 10. Balances were never stored, so this checks the
   invariant the whole build rests on rather than reconciling two copies. */
export function detectLedgerDrift(
  balances: readonly LedgerAccountBalance[],
  globalSum: Money,
): DriftRow[] {
  const drift: DriftRow[] = [];
  for (const balance of balances) {
    if (!balance.derivedBalance.equals(balance.entrySum)) {
      drift.push({
        kind: 'LEDGER_ACCOUNT_IMBALANCE',
        subject: balance.ledgerAccountId,
        field: 'balance',
        expected: balance.derivedBalance.minorUnits.toString(),
        observed: balance.entrySum.minorUnits.toString(),
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
