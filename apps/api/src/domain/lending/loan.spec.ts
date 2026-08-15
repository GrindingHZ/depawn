import { describe, expect, it } from 'vitest';
import {
  accountIdOf,
  borrowerNoteIdOf,
  lenderNoteIdOf,
  loanIdOf,
  receiptIdOf,
} from '../shared/identifiers';
import { Instant } from '../shared/instant';
import { Money, currencyOf } from '../shared/money';
import type { SettlementRef } from '../shared/settlement-ref';
import { Loan, allowedLoanTransitions } from './loan';
import type { LoanEvent, LoanStatus } from './loan';

const aud = currencyOf('AUD');
const startedAt = Instant.fromEpochMilliseconds(1_700_000_000_000n);
const settlementRef: SettlementRef = {
  kind: 'ledger',
  reference: 'LEDGER-TX-1',
  settledAt: startedAt,
};

function originate(overrides: Partial<Parameters<typeof Loan.originate>[0]> = {}): Loan {
  return Loan.originate({
    id: loanIdOf('LOAN-1'),
    receiptId: receiptIdOf('RCP-1'),
    borrowerAccountId: accountIdOf('BORROWER-1'),
    principal: Money.of(250_000n, aud),
    annualPercentageRateBasisPoints: 1_800,
    startedAt,
    durationMs: 2_592_000_000n,
    gracePeriodMs: 604_800_000n,
    lenderNoteId: lenderNoteIdOf('LN-1'),
    borrowerNoteId: borrowerNoteIdOf('BN-1'),
    originationSettlementRef: settlementRef,
    ...overrides,
  });
}

describe('Loan.originate', () => {
  it('derives maturity and grace from the duration in bigint milliseconds', () => {
    const loan = originate();
    expect(loan.status).toBe('ACTIVE');
    expect(loan.maturesAt.epochMilliseconds).toBe(1_700_000_000_000n + 2_592_000_000n);
    expect(loan.graceEndsAt.epochMilliseconds).toBe(
      1_700_000_000_000n + 2_592_000_000n + 604_800_000n,
    );
    expect(loan.version).toBe(0);
  });

  it('identifies the lender only through the note id', () => {
    const loan = originate();
    expect(loan.lenderNoteId).toBe('LN-1');
    expect(Object.values({ ...loan })).not.toContain('LENDER-1');
  });

  it('rejects a non positive principal', () => {
    expect(() => originate({ principal: Money.zero(aud) })).toThrow(
      'A loan principal must be positive',
    );
  });

  it('rejects a zero duration', () => {
    expect(() => originate({ durationMs: 0n })).toThrow('A loan must mature after it starts');
  });

  it('allows a zero grace period', () => {
    const loan = originate({ gracePeriodMs: 0n });
    expect(loan.graceEndsAt.equals(loan.maturesAt)).toBe(true);
  });
});

describe('Loan repayment', () => {
  const oneDay = 24n * 60n * 60n * 1000n;

  it('owes the principal alone at origination', () => {
    const loan = originate();
    expect(loan.calculateAmountDue(startedAt).equals(Money.of(250_000n, aud))).toBe(true);
  });

  it('owes principal plus accrued interest during the term', () => {
    const loan = originate();
    const tenDaysIn = startedAt.plusMilliseconds(10n * oneDay);
    const due = loan.calculateAmountDue(tenDaysIn);
    expect(due.isGreaterThan(Money.of(250_000n, aud))).toBe(true);
    expect(
      due.minus(loan.calculateAccruedInterest(tenDaysIn)).equals(Money.of(250_000n, aud)),
    ).toBe(true);
  });

  it('stops growing after maturity', () => {
    const loan = originate();
    const atMaturity = loan.calculateAmountDue(loan.maturesAt);
    const wellPast = loan.calculateAmountDue(loan.maturesAt.plusMilliseconds(90n * oneDay));
    expect(wellPast.equals(atMaturity)).toBe(true);
  });

  it('settles on the exact amount due and reports the split', () => {
    const loan = originate();
    const tenDaysIn = startedAt.plusMilliseconds(10n * oneDay);
    const due = loan.calculateAmountDue(tenDaysIn);

    const result = loan.recordRepayment(due, tenDaysIn);
    if (!result.ok) {
      throw new Error('the exact amount due must settle the loan');
    }
    expect(result.value.loan.status).toBe('REPAID');
    expect(result.value.total.equals(due)).toBe(true);
    expect(result.value.principal.plus(result.value.accruedInterest).equals(due)).toBe(true);
  });

  it('rejects a payment one minor unit short', () => {
    const loan = originate();
    const tenDaysIn = startedAt.plusMilliseconds(10n * oneDay);
    const due = loan.calculateAmountDue(tenDaysIn);

    const result = loan.recordRepayment(due.minus(Money.of(1n, aud)), tenDaysIn);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('REPAYMENT_AMOUNT_INSUFFICIENT');
    }
  });

  it('rejects a second repayment', () => {
    const loan = originate();
    const due = loan.calculateAmountDue(startedAt);
    const first = loan.recordRepayment(due, startedAt);
    if (!first.ok) {
      throw new Error('the first repayment must settle');
    }

    const second = first.value.loan.recordRepayment(due, startedAt);
    expect(second.ok).toBe(false);
    if (!second.ok) {
      expect(second.error.code).toBe('LOAN_NOT_ACTIVE');
    }
    expect(first.value.loan.canBeRepaid()).toBe(false);
  });
});

describe('Loan default', () => {
  it('refuses a default while the borrower still has grace', () => {
    const loan = originate();
    const result = loan.markDefaulted(loan.maturesAt.plusMilliseconds(1n));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('GRACE_PERIOD_ACTIVE');
    }
  });

  it('refuses a default on the last millisecond of grace', () => {
    const loan = originate();
    // Grace is a real second chance, so the borrower keeps the instant it
    // ends rather than losing the item on it.
    const result = loan.markDefaulted(loan.graceEndsAt);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('GRACE_PERIOD_ACTIVE');
    }
  });

  it('allows a default one millisecond after grace ends', () => {
    const loan = originate();
    const at = loan.graceEndsAt.plusMilliseconds(1n);
    const result = loan.markDefaulted(at);
    if (!result.ok) {
      throw new Error('a loan past grace must be defaultable');
    }
    expect(result.value.status).toBe('DEFAULTED');
    expect(result.value.defaultedAt?.equals(at)).toBe(true);
    expect(result.value.allows('claimReceipt')).toBe(true);
  });

  it('refuses a second default', () => {
    const loan = originate();
    const first = loan.markDefaulted(loan.graceEndsAt.plusMilliseconds(1n));
    if (!first.ok) {
      throw new Error('a loan past grace must be defaultable');
    }
    const again = first.value.markDefaulted(loan.graceEndsAt.plusMilliseconds(2n));
    expect(again.ok).toBe(false);
    if (!again.ok) {
      expect(again.error.code).toBe('LOAN_NOT_ACTIVE');
    }
  });

  it('refuses a default on a repaid loan', () => {
    const loan = originate();
    const repaid = loan.recordRepayment(loan.calculateAmountDue(startedAt), startedAt);
    if (!repaid.ok) {
      throw new Error('the repayment must settle');
    }
    const result = repaid.value.loan.markDefaulted(loan.graceEndsAt.plusMilliseconds(1n));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('LOAN_NOT_ACTIVE');
    }
  });

  it('refuses to reconstruct a defaulted loan with no instant', () => {
    expect(() =>
      Loan.restore({
        id: loanIdOf('LOAN-1'),
        receiptId: receiptIdOf('RCP-1'),
        borrowerAccountId: accountIdOf('BORROWER-1'),
        principal: Money.of(250_000n, aud),
        annualPercentageRateBasisPoints: 1_800,
        startedAt,
        maturesAt: startedAt.plusMilliseconds(2_592_000_000n),
        graceEndsAt: startedAt.plusMilliseconds(3_196_800_000n),
        lenderNoteId: lenderNoteIdOf('LN-1'),
        borrowerNoteId: borrowerNoteIdOf('BN-1'),
        status: 'DEFAULTED',
        originationSettlementRef: settlementRef,
        defaultedAt: null,
        version: 0,
      }),
    ).toThrow('defaultedAt must be set exactly when the loan has defaulted');
  });

  it('carries the grace deadline on the rejection', () => {
    const loan = originate();
    const result = loan.markDefaulted(startedAt);
    if (result.ok) {
      throw new Error('a loan in grace must not be defaultable');
    }
    expect(result.error).toHaveProperty('graceEndsAt');
  });
});

describe('allowedLoanTransitions', () => {
  const everyEvent: readonly LoanEvent[] = ['repay', 'markDefault', 'liquidate', 'claimReceipt'];
  const expected: Record<LoanStatus, readonly LoanEvent[]> = {
    ACTIVE: ['repay', 'markDefault'],
    DEFAULTED: ['liquidate', 'claimReceipt'],
    REPAID: [],
    LIQUIDATED: [],
  };

  it.each(Object.entries(expected))('%s allows exactly %j', (status, events) => {
    const loan = Loan.restore({
      id: loanIdOf('LOAN-1'),
      receiptId: receiptIdOf('RCP-1'),
      borrowerAccountId: accountIdOf('BORROWER-1'),
      principal: Money.of(250_000n, aud),
      annualPercentageRateBasisPoints: 1_800,
      startedAt,
      maturesAt: startedAt.plusMilliseconds(2_592_000_000n),
      graceEndsAt: startedAt.plusMilliseconds(3_196_800_000n),
      lenderNoteId: lenderNoteIdOf('LN-1'),
      borrowerNoteId: borrowerNoteIdOf('BN-1'),
      status: status as LoanStatus,
      originationSettlementRef: settlementRef,
      // A liquidated loan was defaulted first, so both carry the instant.
      defaultedAt: status === 'DEFAULTED' || status === 'LIQUIDATED' ? startedAt : null,
      version: 3,
    });
    for (const event of everyEvent) {
      expect(loan.allows(event)).toBe(events.includes(event));
    }
    expect(allowedLoanTransitions[status as LoanStatus]).toEqual(events);
  });
});
