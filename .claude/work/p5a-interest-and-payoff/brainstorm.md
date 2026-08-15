# p5a-interest-and-payoff brainstorm

## Goal

Make a live loan quotable and repayable: the interest calculator, the payoff quote with its stale
rejection, and the repayment transaction that pays the note holder and frees the collateral.

## What this slice adds

1. `domain/lending/interest-calculator.ts`: `calculateAccruedInterest(principal, rateBasisPoints,
   startedAt, maturesAt, now)` exactly as docs/02 specifies. Elapsed time clamped at maturity,
   bigint throughout, truncating division that rounds in the borrower's favour, and a year fixed at
   365 days in a single exported constant.
2. `Loan.calculateAmountDue(now)`, `canBeRepaid(now)`, and `recordRepayment(payment, now)` returning
   a RepaymentBreakdown, per the entity sketch in docs/02.
3. `PayoffQuoteQuery`: principal, accrued interest, total, quotedAt, validUntil. The validity window
   is a protocol concern with no documented value, so the narrowest reading is a constant beside the
   query with a question recorded if it should be tunable.
4. `RepayLoanUseCase`: one transaction. Lock the loan, assert ACTIVE, recompute at now, reject
   PAYOFF_QUOTE_STALE when the recomputed total differs from the quoted one, resolve the current
   lender note holder, transfer borrower to holder, set REPAID, release the encumbrance, return the
   receipt to the borrower IN_VAULT, emit LoanRepaid.
5. Endpoints `GET /loans/:id/payoff-quote` and `POST /loans/:id/repay`, both party scoped.
6. `POST /test/clock/advance`, mounted only when NODE_ENV is test, so Playwright and the API flow
   tests can reach maturity without waiting (docs/06 line 310). The controller must be absent from
   the production module graph, not merely guarded inside a handler.

   The existing FixedClockAdapter freezes time, which would break the offer lifetime and expiry
   assertions in the specs that already pass under a flowing clock. The endpoint therefore needs an
   offset clock: the system clock plus a mutable offset that only ever grows. Time keeps flowing,
   and a test can still jump a loan past maturity.

   The Playwright api server is started without NODE_ENV, so the webServer entry needs an env of
   its own rather than a shell prefix, which would not survive this platform.

## Risks worth testing hard

- Overflow: principal times rate times elapsed exceeds 64 bits within days at realistic values, so
  a large principal held a full term is a required test.
- Interest must stop at maturity: the value at maturity plus ninety days equals the value at
  maturity.
- Truncation direction: a case where the exact figure has a fractional minor unit must round down.
- Concurrency: two repayments racing produce one REPAID loan, one transfer, and one released
  encumbrance.
- The quote must be rejected when the clock moved past its window, and the response must carry the
  new figure so the UI can show it rather than silently retrying.

## Not in this slice

Redemption (flow 6) and its vault console queue are p5b. Default and liquidation are P6.
