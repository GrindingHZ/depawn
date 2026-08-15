import type { AccountId, LenderNoteId, LoanId } from '../shared/identifiers';

/* Thin by design (docs/02-domain-model.md): the note is the claim on the
   loan, so repayment pays whoever holds it. transferable ships false behind
   the notesTransferable parameter until the securities question is settled. */
export interface LenderNote {
  readonly id: LenderNoteId;
  readonly loanId: LoanId;
  readonly holderAccountId: AccountId;
  readonly transferable: boolean;
}
