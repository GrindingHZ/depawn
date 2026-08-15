import type { AccountId, LoanId, ReceiptId } from '../shared/identifiers';
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
  /* Serialises repayment against any other write to the loan; the Phase 3
     equivalent is shared object consensus ordering on the Loan. */
  lock(id: LoanId, context: UnitOfWorkContext): Promise<void>;
  /* The note holder is resolved inside the repaying transaction so a note
     transfer cannot land between the read and the payment. */
  findLenderNoteHolder(id: LoanId, context: UnitOfWorkContext): Promise<AccountId | null>;
  findLiveByReceipt(receiptId: ReceiptId, context: UnitOfWorkContext): Promise<Loan | null>;
  /* Origination persists the loan and both notes together; later phases save
     the loan alone through save. */
  saveOrigination(originated: OriginatedLoan, context: UnitOfWorkContext): Promise<void>;
  save(loan: Loan, context: UnitOfWorkContext): Promise<void>;
}

export const LOAN_REPOSITORY = Symbol('LoanRepository');
