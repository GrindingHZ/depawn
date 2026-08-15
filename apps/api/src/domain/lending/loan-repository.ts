import type { LoanId, ReceiptId } from '../shared/identifiers';
import type { UnitOfWorkContext } from '../ports/unit-of-work';
import type { BorrowerNote } from './borrower-note';
import type { LenderNote } from './lender-note';
import type { Loan } from './loan';

export interface OriginatedLoan {
  readonly loan: Loan;
  readonly lenderNote: LenderNote;
  readonly borrowerNote: BorrowerNote;
}

export interface LoanRepository {
  findById(id: LoanId, context: UnitOfWorkContext): Promise<Loan | null>;
  findLiveByReceipt(receiptId: ReceiptId, context: UnitOfWorkContext): Promise<Loan | null>;
  /* Origination persists the loan and both notes together; later phases save
     the loan alone through save. */
  saveOrigination(originated: OriginatedLoan, context: UnitOfWorkContext): Promise<void>;
  save(loan: Loan, context: UnitOfWorkContext): Promise<void>;
}

export const LOAN_REPOSITORY = Symbol('LoanRepository');
