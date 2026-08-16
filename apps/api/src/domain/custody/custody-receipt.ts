import type { AccountId, LoanId, ReceiptId, StaffId, VaultId } from '../shared/identifiers';
import type { Instant } from '../shared/instant';
import type { Money } from '../shared/money';
import { failure, ok } from '../shared/result';
import type { Result } from '../shared/result';
import type { ItemCategory } from './item-category';
import { ReceiptAlreadyBurned } from './receipt-already-burned';
import { ReceiptEncumbered } from './receipt-encumbered';
import { ReceiptNotEncumbered } from './receipt-not-encumbered';
import { ReceiptNotInVault } from './receipt-not-in-vault';

export type ReceiptStatus = 'IN_VAULT' | 'ENCUMBERED' | 'RELEASED' | 'LIQUIDATED';

export type ReceiptEvent =
  | 'encumber'
  | 'releaseEncumbrance'
  | 'claimDefault'
  | 'transferHolder'
  | 'burnForRedemption'
  | 'burnForLiquidation';

/* The exhaustive transition table from docs/02-domain-model.md. claimDefault
   lands in IN_VAULT under the new holder per docs/10 flow 7 (Q-012 records
   the diagram divergence), and burnForLiquidation is reachable from both live
   states because a liquidation may run before or after a lender claim. */
export const allowedReceiptTransitions: Record<ReceiptStatus, readonly ReceiptEvent[]> = {
  IN_VAULT: ['encumber', 'transferHolder', 'burnForRedemption', 'burnForLiquidation'],
  ENCUMBERED: ['releaseEncumbrance', 'claimDefault', 'burnForLiquidation'],
  RELEASED: [],
  LIQUIDATED: [],
};

interface CustodyReceiptFields {
  readonly id: ReceiptId;
  readonly vaultId: VaultId;
  readonly holderAccountId: AccountId;
  readonly intakeRecordHash: string;
  readonly appraisedValue: Money;
  readonly appraisedAt: Instant;
  readonly appraiserId: StaffId;
  readonly itemCategory: ItemCategory;
  /* Copied from the intake at issuance rather than joined back to it. A
     receipt that cannot say what it is a receipt for is incomplete, and in
     Phase 3 it is an object on chain with nothing to join to. */
  readonly itemDescription: string;
  readonly insurancePolicyReference: string;
  readonly status: ReceiptStatus;
  readonly encumberedByLoanId: LoanId | null;
  readonly version: number;
}

export class CustodyReceipt {
  private constructor(private readonly fields: CustodyReceiptFields) {
    if ((fields.status === 'ENCUMBERED') !== (fields.encumberedByLoanId !== null)) {
      throw new Error('ENCUMBERED and encumberedByLoanId must agree');
    }
  }

  get id(): ReceiptId {
    return this.fields.id;
  }
  get vaultId(): VaultId {
    return this.fields.vaultId;
  }
  get holderAccountId(): AccountId {
    return this.fields.holderAccountId;
  }
  get intakeRecordHash(): string {
    return this.fields.intakeRecordHash;
  }
  get appraisedValue(): Money {
    return this.fields.appraisedValue;
  }
  get appraisedAt(): Instant {
    return this.fields.appraisedAt;
  }
  get appraiserId(): StaffId {
    return this.fields.appraiserId;
  }
  get itemCategory(): ItemCategory {
    return this.fields.itemCategory;
  }
  get itemDescription(): string {
    return this.fields.itemDescription;
  }
  get insurancePolicyReference(): string {
    return this.fields.insurancePolicyReference;
  }
  get status(): ReceiptStatus {
    return this.fields.status;
  }
  get encumberedByLoanId(): LoanId | null {
    return this.fields.encumberedByLoanId;
  }
  get version(): number {
    return this.fields.version;
  }

  static issue(
    input: Omit<CustodyReceiptFields, 'status' | 'encumberedByLoanId' | 'version'>,
  ): CustodyReceipt {
    return new CustodyReceipt({
      ...input,
      status: 'IN_VAULT',
      encumberedByLoanId: null,
      version: 0,
    });
  }

  static restore(fields: CustodyReceiptFields): CustodyReceipt {
    return new CustodyReceipt(fields);
  }

  encumber(loanId: LoanId): Result<CustodyReceipt, ReceiptNotInVault> {
    if (!this.allows('encumber')) {
      return failure(new ReceiptNotInVault());
    }
    return ok(
      new CustodyReceipt({ ...this.fields, status: 'ENCUMBERED', encumberedByLoanId: loanId }),
    );
  }

  releaseEncumbrance(): Result<CustodyReceipt, ReceiptNotEncumbered> {
    if (!this.allows('releaseEncumbrance')) {
      return failure(new ReceiptNotEncumbered());
    }
    return ok(new CustodyReceipt({ ...this.fields, status: 'IN_VAULT', encumberedByLoanId: null }));
  }

  claimDefault(claimantAccountId: AccountId): Result<CustodyReceipt, ReceiptNotEncumbered> {
    if (!this.allows('claimDefault')) {
      return failure(new ReceiptNotEncumbered());
    }
    return ok(
      new CustodyReceipt({
        ...this.fields,
        status: 'IN_VAULT',
        encumberedByLoanId: null,
        holderAccountId: claimantAccountId,
      }),
    );
  }

  transferHolder(
    toHolder: AccountId,
  ): Result<CustodyReceipt, ReceiptEncumbered | ReceiptAlreadyBurned> {
    if (!this.allows('transferHolder')) {
      return failure(this.movementRejection());
    }
    return ok(new CustodyReceipt({ ...this.fields, holderAccountId: toHolder }));
  }

  burnForRedemption(): Result<CustodyReceipt, ReceiptEncumbered | ReceiptAlreadyBurned> {
    if (!this.allows('burnForRedemption')) {
      return failure(this.movementRejection());
    }
    return ok(new CustodyReceipt({ ...this.fields, status: 'RELEASED' }));
  }

  burnForLiquidation(): Result<CustodyReceipt, ReceiptAlreadyBurned> {
    if (!this.allows('burnForLiquidation')) {
      return failure(new ReceiptAlreadyBurned());
    }
    return ok(
      new CustodyReceipt({ ...this.fields, status: 'LIQUIDATED', encumberedByLoanId: null }),
    );
  }

  allows(event: ReceiptEvent): boolean {
    return allowedReceiptTransitions[this.fields.status].includes(event);
  }

  private movementRejection(): ReceiptEncumbered | ReceiptAlreadyBurned {
    return this.fields.status === 'ENCUMBERED'
      ? new ReceiptEncumbered()
      : new ReceiptAlreadyBurned();
  }
}
