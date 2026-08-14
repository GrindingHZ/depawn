import type { AccountId, LoanId, ReceiptId, StaffId, VaultId } from '../shared/identifiers';
import type { Instant } from '../shared/instant';
import type { Money } from '../shared/money';
import type { ItemCategory } from './item-category';

export type ReceiptStatus = 'IN_VAULT' | 'ENCUMBERED' | 'RELEASED' | 'LIQUIDATED';

/* Declared as a readonly shape in P0 so the custody port can be typed; the
   entity with its state machine lands in P2 per docs/07-phase-plan.md. */
export interface CustodyReceipt {
  readonly id: ReceiptId;
  readonly vaultId: VaultId;
  readonly holderAccountId: AccountId;
  readonly intakeRecordHash: string;
  readonly appraisedValue: Money;
  readonly appraisedAt: Instant;
  readonly appraiserId: StaffId;
  readonly itemCategory: ItemCategory;
  readonly insurancePolicyReference: string;
  readonly status: ReceiptStatus;
  readonly encumberedByLoanId: LoanId | null;
}
