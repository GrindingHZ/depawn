import type {
  BorrowerNote as BorrowerNoteRow,
  LenderNote as LenderNoteRow,
  Loan as LoanRow,
} from '@prisma/client';
import type { BorrowerNote } from '../../../domain/lending/borrower-note';
import type { LenderNote } from '../../../domain/lending/lender-note';
import { Loan } from '../../../domain/lending/loan';
import {
  accountIdOf,
  borrowerNoteIdOf,
  lenderNoteIdOf,
  loanIdOf,
  receiptIdOf,
} from '../../../domain/shared/identifiers';
import { Instant } from '../../../domain/shared/instant';
import { Money, currencyOf } from '../../../domain/shared/money';
import type { SettlementRef } from '../../../domain/shared/settlement-ref';

function instantOf(value: Date): Instant {
  return Instant.fromEpochMilliseconds(BigInt(value.getTime()));
}

function dateOf(value: Instant): Date {
  return new Date(Number(value.epochMilliseconds));
}

function settlementKindOf(value: string): SettlementRef['kind'] {
  if (value !== 'ledger' && value !== 'chain') {
    throw new Error(`Unknown settlement kind ${value}`);
  }
  return value;
}

export function toLoan(row: LoanRow): Loan {
  return Loan.restore({
    id: loanIdOf(row.id),
    receiptId: receiptIdOf(row.receiptId),
    borrowerAccountId: accountIdOf(row.borrowerAccountId),
    principal: Money.of(row.principalMinorUnits, currencyOf(row.currency)),
    annualPercentageRateBasisPoints: row.annualPercentageRateBasisPoints,
    startedAt: instantOf(row.startedAt),
    maturesAt: instantOf(row.maturesAt),
    graceEndsAt: instantOf(row.graceEndsAt),
    lenderNoteId: lenderNoteIdOf(row.lenderNoteId),
    borrowerNoteId: borrowerNoteIdOf(row.borrowerNoteId),
    status: row.status,
    originationSettlementRef: {
      kind: settlementKindOf(row.originationSettlementKind),
      reference: row.originationSettlementReference,
      settledAt: instantOf(row.originationSettledAt),
    },
    defaultedAt: row.defaultedAt === null ? null : instantOf(row.defaultedAt),
    version: row.version,
  });
}

export function toLoanRow(loan: Loan): Omit<LoanRow, 'createdAt' | 'updatedAt' | 'version'> {
  return {
    id: loan.id,
    receiptId: loan.receiptId,
    borrowerAccountId: loan.borrowerAccountId,
    principalMinorUnits: loan.principal.minorUnits,
    currency: loan.principal.currency,
    annualPercentageRateBasisPoints: loan.annualPercentageRateBasisPoints,
    startedAt: dateOf(loan.startedAt),
    maturesAt: dateOf(loan.maturesAt),
    graceEndsAt: dateOf(loan.graceEndsAt),
    lenderNoteId: loan.lenderNoteId,
    borrowerNoteId: loan.borrowerNoteId,
    status: loan.status,
    originationSettlementKind: loan.originationSettlementRef.kind,
    originationSettlementReference: loan.originationSettlementRef.reference,
    originationSettledAt: dateOf(loan.originationSettlementRef.settledAt),
    defaultedAt: loan.defaultedAt === null ? null : dateOf(loan.defaultedAt),
  };
}

export function toLenderNote(row: LenderNoteRow): LenderNote {
  return {
    id: lenderNoteIdOf(row.id),
    loanId: loanIdOf(row.loanId),
    holderAccountId: accountIdOf(row.holderAccountId),
    transferable: row.transferable,
  };
}

export function toBorrowerNote(row: BorrowerNoteRow): BorrowerNote {
  return {
    id: borrowerNoteIdOf(row.id),
    loanId: loanIdOf(row.loanId),
    holderAccountId: accountIdOf(row.holderAccountId),
    transferable: row.transferable,
  };
}
