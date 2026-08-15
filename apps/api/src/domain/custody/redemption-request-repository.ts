import type { UnitOfWorkContext } from '../ports/unit-of-work';
import type { AccountId, ReceiptId, RedemptionRequestId, VaultId } from '../shared/identifiers';
import type { RedemptionRequest, RedemptionStatus } from './redemption-request';

export interface RedemptionRequestRepository {
  findById(id: RedemptionRequestId, context: UnitOfWorkContext): Promise<RedemptionRequest | null>;
  findByReceipt(
    receiptId: ReceiptId,
    context: UnitOfWorkContext,
  ): Promise<RedemptionRequest | null>;
  listByRequester(
    accountId: AccountId,
    context: UnitOfWorkContext,
  ): Promise<readonly RedemptionRequest[]>;
  listForVault(
    vaultId: VaultId,
    statuses: readonly RedemptionStatus[],
    context: UnitOfWorkContext,
  ): Promise<readonly RedemptionRequest[]>;
  /* Serialises the two counter steps against each other so a duplicated
     release confirmation cannot hand the same item over twice. */
  lock(id: RedemptionRequestId, context: UnitOfWorkContext): Promise<void>;
  save(request: RedemptionRequest, context: UnitOfWorkContext): Promise<void>;
}

export const REDEMPTION_REQUEST_REPOSITORY = Symbol('RedemptionRequestRepository');
