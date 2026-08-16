import { errorCodes } from './error-codes';
import type { ErrorCode } from './error-codes';

/* One sentence per code, addressed to whoever is looking at the screen. A
   screen with something better to say still says it; this is what stops a
   code nobody anticipated from reaching a person as a shrug. The codes are
   the contract, so the table lives beside them and a test proves it is
   complete rather than nearly complete.

   Rules the copy follows: say what happened, not what the server did; never
   blame the reader; never name an internal concept the reader has no word
   for; and if there is an obvious next move, say it. */
const copy: Record<ErrorCode, string> = {
  UNAUTHENTICATED: 'Your session has ended. Sign in again to continue.',
  FORBIDDEN: 'This action is not available to your account.',
  NOT_FOUND: 'That is no longer here. It may have been completed or withdrawn.',
  VALIDATION_FAILED: 'Some of what was entered cannot be used. Check the highlighted fields.',
  FAULT: 'Something went wrong at our end. Nothing was changed. Try again.',
  IDEMPOTENCY_KEY_REUSED: 'This looks like a repeat of a different request. Start it again.',
  EMAIL_ALREADY_REGISTERED: 'An account already exists for this email. Sign in instead.',
  INSUFFICIENT_FUNDS: 'Your available balance does not cover this.',
  CURRENCY_MISMATCH: 'That amount is in a different currency from the one owed.',
  INTAKE_NOT_SEALED: 'The intake has to be sealed before this step.',
  INTAKE_ALREADY_SEALED: 'This intake is sealed and can no longer be edited.',
  INTAKE_INCOMPLETE: 'The intake still needs a seal number, a photograph, and an appraisal.',
  DUAL_APPRAISAL_REQUIRED: 'An item at this value needs a second, independent appraisal.',
  RECEIPT_NOT_IN_VAULT: 'This item is not currently in the vault.',
  RECEIPT_ENCUMBERED: 'This item is security for a live loan and cannot move yet.',
  RECEIPT_NOT_ENCUMBERED: 'This item is not attached to a loan.',
  RECEIPT_ALREADY_BURNED: 'This receipt has already been spent.',
  REDEMPTION_NOT_VERIFIED: 'Identity has to be verified before the item is handed over.',
  REDEMPTION_ALREADY_VERIFIED: 'Identity was already verified for this collection.',
  REDEMPTION_ALREADY_RELEASED: 'This item has already been handed over.',
  VAULT_INSURED_LIMIT_EXCEEDED: 'The vault has reached its insured limit and cannot take this in.',
  LISTING_NOT_ACTIVE: 'This listing is no longer taking offers.',
  LISTING_NOT_DRAFT: 'This listing has already been published.',
  RECEIPT_ALREADY_LISTED: 'This item is already listed.',
  HOLD_NOT_RECLAIMABLE: 'These funds are not free to reclaim yet.',
  LISTING_EXPIRED: 'This listing has expired. The borrower can publish a new one.',
  LISTING_ALREADY_MATCHED: 'An offer on this listing has already been accepted.',
  OFFER_NOT_PENDING: 'This offer is no longer on the table.',
  OFFER_EXPIRED: 'This offer has expired.',
  OFFER_WITHDRAWAL_TOO_EARLY: 'An offer has to stand for a few minutes before it can be withdrawn.',
  LOAN_TO_VALUE_EXCEEDED: 'That is more than we can lend against this item.',
  RATE_ABOVE_MAXIMUM: 'That rate is above the ceiling for this listing.',
  LOAN_NOT_ACTIVE: 'This loan is already closed.',
  LOAN_NOT_MATURED: 'This loan has not reached its maturity date yet.',
  LOAN_NOT_DEFAULTED: 'This loan has not defaulted.',
  GRACE_PERIOD_ACTIVE: 'The borrower still has grace time to repay.',
  REPAYMENT_AMOUNT_INSUFFICIENT: 'That payment no longer covers the loan.',
  PAYOFF_QUOTE_STALE: 'Interest moved while you were reading. Take a fresh quote.',
  HOLDING_PERIOD_ACTIVE: 'The statutory holding period has not run out yet.',
  LIQUIDATION_NOT_OPEN: 'This sale is not taking bids.',
  LIQUIDATION_NOT_SCHEDULED: 'This sale has not been scheduled.',
  LIQUIDATION_ALREADY_SCHEDULED: 'A sale is already scheduled for this loan.',
  BID_BELOW_RESERVE: 'That bid is below the reserve.',
  NOTE_TRANSFER_DISABLED: 'Notes cannot be transferred.',
  SYSTEM_PAUSED: 'Trading is paused. Repayments and collections are unaffected.',
};

export function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === 'string' && value in errorCodes;
}

/* Takes whatever the screen caught. Anything that is not one of our codes
   gets the sentence for a fault, because to the reader that is what it is. */
export function messageForErrorCode(code: unknown): string {
  return isErrorCode(code) ? copy[code] : copy.FAULT;
}

/* What a screen falls back to. A screen says its own sentence for the codes
   it expects; for a code it did not expect, the reason is better than the
   shrug, and the shrug is kept only for something that is not one of ours at
   all, such as the network being down. */
export function messageForError(error: unknown, fallback: string): string {
  const code: unknown = (error as { code?: unknown } | null)?.code;
  return isErrorCode(code) ? copy[code] : fallback;
}
