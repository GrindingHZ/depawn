# p5a-interest-and-payoff verify

- pnpm check: exit 0
- pnpm test:unit: exit 0
- pnpm test:integration: exit 0
- pnpm test:e2e: exit 0 (15 tests, one new)

Environment note: the first e2e attempt failed because the Postgres container had stopped between
runs. Nothing in the suite was at fault; `pnpm db:up` and a rerun gave 15 of 15.

## Flow 5 exit criteria

- The interest calculator matches the docs/02 formula and is pinned at every boundary the doc calls
  out: zero at origination, linear through the term, frozen from maturity onwards, truncating in
  the borrower's favour, and correct on a principal whose intermediate product exceeds 64 bits.
- A payoff quote carries principal, accrued interest, total, quotedAt, and validUntil, and is
  refused to anyone who is not party to the loan.
- Repayment is one transaction that locks the loan, recomputes the figure, resolves the note holder
  inside that transaction, pays them, marks the loan REPAID, and returns the receipt to the
  borrower IN_VAULT. The integration test pins the arithmetic end to end: 1232 minor units of
  interest on 250000 over ten days, a lender left with 251232, a borrower left with 43768.
- A stale quote is rejected with the current figure in the error details, and the loan is untouched.
- Twenty rounds of two concurrent repayments produce one settlement, one REPAY_LOAN ledger
  transaction, and a REPAID loan. Two HTTP requests under one idempotency key do the same.
- Partial payment is refused and overpayment cannot overcharge, because the transfer always moves
  the computed total rather than the amount the client declared.
- Every money moving test ends at toSumToZero.

## Notes carried forward

- Q-015: the five minute quote validity is a constant, not yet a protocol parameter.
- Q-016: the test clock is process wide, so time travelling specs run in their own Playwright
  project after the others and reset the clock afterwards.
- Repay still answers 403 rather than 404 to a caller who is party to no loan, matching the
  sitewide convention rather than the 404 the read endpoints give. Recorded in review.md.
