import type { UnitOfWorkContext } from '../ports/unit-of-work';
import type { ReceiptId, VaultId } from '../shared/identifiers';
import type { Money } from '../shared/money';
import type { LedgerTransactionBalance, ReconciliationRun } from './reconciliation-run';

export interface LedgerSnapshot {
  readonly transactions: readonly LedgerTransactionBalance[];
  readonly globalSum: Money;
}

/* Reconciliation reads across custody and the ledger, which is why it gets a
   port of its own rather than reaching past the seam into Postgres. Phase 3
   adds the third column, on chain receipts, behind this same interface. */
export interface ReconciliationRepository {
  recordedReceiptIds(vaultId: VaultId, context: UnitOfWorkContext): Promise<readonly ReceiptId[]>;
  ledgerSnapshot(context: UnitOfWorkContext): Promise<LedgerSnapshot>;
  saveRun(run: ReconciliationRun, context: UnitOfWorkContext): Promise<void>;
}

export const RECONCILIATION_REPOSITORY = Symbol('ReconciliationRepository');
