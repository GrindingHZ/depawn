import type { Loan } from '../lending/loan';
import type { AccountId, LoanId } from '../shared/identifiers';

/* Who is owed is whoever holds the lender note, so every loan read carries
   the current holder resolved through the note join (docs/02-domain-model.md). */
export interface LoanReadModel {
  readonly loan: Loan;
  readonly lenderNoteHolderAccountId: AccountId;
}

export type LoanParticipantRole = 'borrower' | 'lender';

export interface LoanQueries {
  findById(loanId: LoanId): Promise<LoanReadModel | null>;
  listByParticipant(
    accountId: AccountId,
    role: LoanParticipantRole,
  ): Promise<readonly LoanReadModel[]>;
}

export const LOAN_QUERIES = Symbol('LoanQueries');
