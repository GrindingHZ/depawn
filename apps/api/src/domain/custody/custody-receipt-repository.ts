import type { AccountId, ReceiptId, VaultId } from '../shared/identifiers';
import type { Money } from '../shared/money';
import type { Currency } from '../shared/money';
import type { UnitOfWorkContext } from '../ports/unit-of-work';
import type { CustodyReceipt, ReceiptStatus } from './custody-receipt';

export interface CustodyReceiptRepository {
  findById(id: ReceiptId, context: UnitOfWorkContext): Promise<CustodyReceipt | null>;
  listByHolder(
    holderAccountId: AccountId,
    context: UnitOfWorkContext,
  ): Promise<readonly CustodyReceipt[]>;
  listByVault(
    vaultId: VaultId,
    statuses: readonly ReceiptStatus[],
    context: UnitOfWorkContext,
  ): Promise<readonly CustodyReceipt[]>;
  /* Rule C5: the sum of appraised values of IN_VAULT and ENCUMBERED receipts. */
  exposureOf(vaultId: VaultId, currency: Currency, context: UnitOfWorkContext): Promise<Money>;
  save(receipt: CustodyReceipt, context: UnitOfWorkContext): Promise<void>;
}

export const CUSTODY_RECEIPT_REPOSITORY = Symbol('CustodyReceiptRepository');
