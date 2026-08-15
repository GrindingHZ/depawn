# p4b-origination-ui review

Fresh subagent review of `git diff 65a7ba9..HEAD`. Verdict BLOCKED on one finding, with three notes.

## Findings

1. [blocking] `loan-status-tone.ts`: LIQUIDATED fell through to neutral, while the frozen brief puts
   it in danger beside DEFAULTED, and the parameter typed as `string` with a default case defeated
   the exhaustiveness rule in docs/09.
2. [note] The accept idempotency key is generated on mount and rotated only on success, and the
   interceptor releases a failed claim, so a retry after a rejection is not poisoned. No action.
3. [note] The Playwright spec proved the borrower sees no offer form but never proved a lender sees
   no Accept control, so half the visibility rule rested on code reading.
4. [note] Accepting encumbers the collateral, but `marketKeys.myReceipts` was not invalidated, so a
   cached receipts screen would still offer the item for listing.
5. [note] Commit messages, prose, and design tokens all clean across the diff.

Confirmed clean by the reviewer: the borrower split keys on the actual `borrowerAccountId`, every
amount renders through Money and every rate through Rate with no numeric money arithmetic, loading
uses Skeleton, errors use `role="alert"`, and the spec seeds through the API and asserts through the
UI with unique accounts per run.

## Fixes applied

1. `fix(marketplace): give liquidated and overdue loans their tones` makes the switch exhaustive over
   `LoanStatusDto` with no default case, so an unhandled status becomes a compile error, and sends
   LIQUIDATED to danger. Checking the brief while fixing it surfaced a second gap in the same table
   row: a loan past maturity must read warning although its status is still ACTIVE. The badge now
   derives from the clock as well as the status, labelled PAST MATURITY rather than IN GRACE, because
   an active loan can also sit past the end of grace before any note holder marks it defaulted. That
   unnamed cell is recorded as Q-014.
2. `fix(marketplace): refresh receipts and prove lenders cannot accept` invalidates the receipts key
   on acceptance and adds the missing negative assertion to the Playwright journey.

Gates after the fixes: `pnpm check` exit 0, 14 of 14 Playwright tests green.
