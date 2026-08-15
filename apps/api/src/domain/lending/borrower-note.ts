import type { AccountId, BorrowerNoteId, LoanId } from '../shared/identifiers';

/* The borrower's proof of the redemption right over the encumbered receipt,
   mirrored as an owned object in Phase 3. */
export interface BorrowerNote {
  readonly id: BorrowerNoteId;
  readonly loanId: LoanId;
  readonly holderAccountId: AccountId;
  readonly transferable: boolean;
}
