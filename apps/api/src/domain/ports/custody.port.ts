import type { CustodyReceipt } from '../custody/custody-receipt';
import type { ItemCategory } from '../custody/item-category';
import type { AccountId, LoanId, ReceiptId, StaffId, VaultId } from '../shared/identifiers';
import type { Instant } from '../shared/instant';
import type { Money } from '../shared/money';
import type { SettlementRef } from '../shared/settlement-ref';
import type { UnitOfWorkContext } from './unit-of-work';

export interface IssueReceiptCommand {
  readonly vaultId: VaultId;
  readonly holderAccountId: AccountId;
  readonly intakeRecordHash: string;
  readonly appraisedValue: Money;
  readonly appraisedAt: Instant;
  readonly appraiserId: StaffId;
  readonly itemCategory: ItemCategory;
  readonly insurancePolicyReference: string;
}

export type BurnReason = 'REDEMPTION' | 'LIQUIDATION';

export interface CustodyPort {
  issueReceipt(
    command: IssueReceiptCommand,
    unitOfWork: UnitOfWorkContext,
  ): Promise<CustodyReceipt>;
  transferReceipt(
    receiptId: ReceiptId,
    toHolder: AccountId,
    unitOfWork: UnitOfWorkContext,
  ): Promise<SettlementRef>;
  encumberReceipt(
    receiptId: ReceiptId,
    loanId: LoanId,
    unitOfWork: UnitOfWorkContext,
  ): Promise<void>;
  releaseEncumbrance(receiptId: ReceiptId, unitOfWork: UnitOfWorkContext): Promise<void>;
  burnReceipt(
    receiptId: ReceiptId,
    reason: BurnReason,
    unitOfWork: UnitOfWorkContext,
  ): Promise<SettlementRef>;
}

export const CUSTODY_PORT = Symbol('CustodyPort');
