import type {
  AccountId,
  BorrowerNoteId,
  LenderNoteId,
  LoanId,
  ReceiptId,
} from '../shared/identifiers';
import type { Instant } from '../shared/instant';
import type { Money } from '../shared/money';
import { failure, ok } from '../shared/result';
import type { Result } from '../shared/result';
import type { SettlementRef } from '../shared/settlement-ref';
import { calculateAccruedInterest } from './interest-calculator';
import { LoanNotActive } from './loan-not-active';
import { RepaymentAmountInsufficient } from './repayment-amount-insufficient';

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

export interface RepaymentBreakdown {
  readonly loan: Loan;
  readonly principal: Money;
  readonly accruedInterest: Money;
  readonly total: Money;
}

export type RepaymentRejected = LoanNotActive | RepaymentAmountInsufficient;

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

/* Default and liquidation behaviour arrive with P6, which owns the grace
   gate. The loan stores the lender note id, never the lender account id: who
   is owed is whoever holds the note (docs/02-domain-model.md). */
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

  calculateAccruedInterest(now: Instant): Money {
    return calculateAccruedInterest(
      this.fields.principal,
      this.fields.annualPercentageRateBasisPoints,
      this.fields.startedAt,
      this.fields.maturesAt,
      now,
    );
  }

  calculateAmountDue(now: Instant): Money {
    return this.fields.principal.plus(this.calculateAccruedInterest(now));
  }

  canBeRepaid(): boolean {
    return this.allows('repay');
  }

  /* Repayment is all or nothing: a payment above the total is not change to
     be given, it is a caller sending the wrong number, so only the exact
     amount due settles the loan. */
  recordRepayment(payment: Money, now: Instant): Result<RepaymentBreakdown, RepaymentRejected> {
    if (!this.canBeRepaid()) {
      return failure(new LoanNotActive());
    }
    const accruedInterest = this.calculateAccruedInterest(now);
    const total = this.fields.principal.plus(accruedInterest);
    if (payment.isLessThan(total)) {
      return failure(new RepaymentAmountInsufficient(total));
    }
    return ok({
      loan: new Loan({ ...this.fields, status: 'REPAID' }),
      principal: this.fields.principal,
      accruedInterest,
      total,
    });
  }

  allows(event: LoanEvent): boolean {
    return allowedLoanTransitions[this.fields.status].includes(event);
  }
}
