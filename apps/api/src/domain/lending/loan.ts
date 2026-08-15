import type {
  AccountId,
  BorrowerNoteId,
  LenderNoteId,
  LoanId,
  ReceiptId,
} from '../shared/identifiers';
import type { Instant } from '../shared/instant';
import type { Money } from '../shared/money';
import type { SettlementRef } from '../shared/settlement-ref';

export type LoanStatus = 'ACTIVE' | 'REPAID' | 'DEFAULTED' | 'LIQUIDATED';

export type LoanEvent = 'repay' | 'markDefault' | 'liquidate' | 'claimReceipt';

/* The exhaustive transition table from docs/02-domain-model.md. claimReceipt
   changes the receipt holder without leaving DEFAULTED, so the loan allows it
   from that status only. */
export const allowedLoanTransitions: Record<LoanStatus, readonly LoanEvent[]> = {
  ACTIVE: ['repay', 'markDefault'],
  DEFAULTED: ['liquidate', 'claimReceipt'],
  REPAID: [],
  LIQUIDATED: [],
};

interface LoanFields {
  readonly id: LoanId;
  readonly receiptId: ReceiptId;
  readonly borrowerAccountId: AccountId;
  readonly principal: Money;
  readonly annualPercentageRateBasisPoints: number;
  readonly startedAt: Instant;
  readonly maturesAt: Instant;
  readonly graceEndsAt: Instant;
  readonly lenderNoteId: LenderNoteId;
  readonly borrowerNoteId: BorrowerNoteId;
  readonly status: LoanStatus;
  readonly originationSettlementRef: SettlementRef;
  readonly version: number;
}

export interface OriginateLoanInput {
  readonly id: LoanId;
  readonly receiptId: ReceiptId;
  readonly borrowerAccountId: AccountId;
  readonly principal: Money;
  readonly annualPercentageRateBasisPoints: number;
  readonly startedAt: Instant;
  readonly durationMs: bigint;
  readonly gracePeriodMs: bigint;
  readonly lenderNoteId: LenderNoteId;
  readonly borrowerNoteId: BorrowerNoteId;
  readonly originationSettlementRef: SettlementRef;
}

/* Repayment, default, and liquidation behaviour arrive with P5 and P6, which
   own the interest calculator and the grace gate; P4 needs only origination
   and the table those phases will guard against. The loan stores the lender
   note id, never the lender account id: who is owed is whoever holds the
   note (docs/02-domain-model.md). */
export class Loan {
  private constructor(private readonly fields: LoanFields) {
    if (fields.principal.isNegative() || fields.principal.isZero()) {
      throw new Error('A loan principal must be positive');
    }
    if (!fields.maturesAt.isAfter(fields.startedAt)) {
      throw new Error('A loan must mature after it starts');
    }
    if (fields.graceEndsAt.isBefore(fields.maturesAt)) {
      throw new Error('Grace cannot end before maturity');
    }
  }

  get id(): LoanId {
    return this.fields.id;
  }
  get receiptId(): ReceiptId {
    return this.fields.receiptId;
  }
  get borrowerAccountId(): AccountId {
    return this.fields.borrowerAccountId;
  }
  get principal(): Money {
    return this.fields.principal;
  }
  get annualPercentageRateBasisPoints(): number {
    return this.fields.annualPercentageRateBasisPoints;
  }
  get startedAt(): Instant {
    return this.fields.startedAt;
  }
  get maturesAt(): Instant {
    return this.fields.maturesAt;
  }
  get graceEndsAt(): Instant {
    return this.fields.graceEndsAt;
  }
  get lenderNoteId(): LenderNoteId {
    return this.fields.lenderNoteId;
  }
  get borrowerNoteId(): BorrowerNoteId {
    return this.fields.borrowerNoteId;
  }
  get status(): LoanStatus {
    return this.fields.status;
  }
  get originationSettlementRef(): SettlementRef {
    return this.fields.originationSettlementRef;
  }
  get version(): number {
    return this.fields.version;
  }

  static originate(input: OriginateLoanInput): Loan {
    const maturesAt = input.startedAt.plusMilliseconds(input.durationMs);
    return new Loan({
      id: input.id,
      receiptId: input.receiptId,
      borrowerAccountId: input.borrowerAccountId,
      principal: input.principal,
      annualPercentageRateBasisPoints: input.annualPercentageRateBasisPoints,
      startedAt: input.startedAt,
      maturesAt,
      graceEndsAt: maturesAt.plusMilliseconds(input.gracePeriodMs),
      lenderNoteId: input.lenderNoteId,
      borrowerNoteId: input.borrowerNoteId,
      status: 'ACTIVE',
      originationSettlementRef: input.originationSettlementRef,
      version: 0,
    });
  }

  static restore(fields: LoanFields): Loan {
    return new Loan(fields);
  }

  allows(event: LoanEvent): boolean {
    return allowedLoanTransitions[this.fields.status].includes(event);
  }
}
