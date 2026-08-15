# p5a-interest-and-payoff plan

Slice base: recorded at plan time. Flow 5 end to end on the backend plus the borrower repay screen.

## Tasks

1. `feat(domain): add the interest calculator`
   `domain/lending/interest-calculator.ts` with `MILLISECONDS_PER_YEAR` at 365 days, elapsed time
   clamped to maturity, bigint arithmetic throughout, truncating division.
2. `test(domain): pin interest accrual at the boundaries`
   Zero at origination, linear through the term, frozen at maturity and beyond, truncation rounding
   towards the borrower, and no overflow on a large principal over a full term.
3. `feat(domain): let a loan quote and record its repayment`
   `Loan.calculateAmountDue(now)`, `canBeRepaid(now)`, `recordRepayment(payment, now)` returning a
   RepaymentBreakdown of principal and interest, rejecting a payment below the total with
   RepaymentAmountInsufficient and a closed loan with LoanNotActive.
4. `test(domain): cover the repayment guards`
5. `feat(lending): add the payoff quote`
   `PayoffQuoteQuery` returning principal, accruedInterest, total, quotedAt, validUntil, and
   `GET /loans/:id/payoff-quote` scoped to the loan parties. The validity window is a constant beside
   the query with an open question if it should become a protocol parameter.
6. `feat(lending): add the repay loan use case`
   One transaction: lock the loan, assert ACTIVE, recompute at now, reject PAYOFF_QUOTE_STALE with
   the current figure in the error details, resolve the current lender note holder, transfer from
   the borrower, set REPAID, release the encumbrance, return the receipt to the borrower, emit
   LoanRepaid.
7. `feat(api): expose the repayment endpoint`
   `POST /loans/:id/repay` with the quoted total and quotedAt, idempotent, error mapping for
   LOAN_NOT_ACTIVE, PAYOFF_QUOTE_STALE, INSUFFICIENT_FUNDS, REPAYMENT_AMOUNT_INSUFFICIENT.
8. `feat(api): add the test only clock endpoint`
   An offset clock adapter behind ClockPort, plus a `POST /test/clock/advance` controller whose
   module is only imported when NODE_ENV is test, and a Playwright webServer env that sets it.
   The offset only grows. Guarded by a test proving the route is absent otherwise.
9. `test(api): prove repayment settles and frees the collateral`
   Integration: quote then repay, ledger sums to zero, the note holder receives the total, the loan
   is REPAID, the receipt is IN_VAULT and held by the borrower, and a second repayment is rejected.
10. `test(api): reject a stale quote and race two repayments`
    A quote taken, the clock advanced, repayment rejected with the new figure returned. Then twenty
    rounds of two concurrent repayments producing one REPAID loan and one transfer.
11. `feat(marketplace): add the payoff and repay screen`
    `/borrow/loans` gains a payoff panel per active loan: the quote, a countdown to validUntil, a
    refetch on expiry, and a repay action that sends quotedAt. A PAYOFF_QUOTE_STALE response shows
    the new figure rather than retrying silently.
12. `test(e2e): repay a loan and redeem the collateral`
    Playwright: originate, advance the clock, repay, and see the receipt back in the borrower's
    receipts as IN_VAULT.
13. Review by a fresh subagent, fixes as new commits, then the four gates and close.

## Notes

- Partial repayment is out of scope and must be rejected, not silently accepted (docs/10 flow 5).
- The loan stores no lender account id, so the transfer target is resolved through the lender note
  inside the transaction; a note transfer landing between quote and repayment must not misdirect it.
