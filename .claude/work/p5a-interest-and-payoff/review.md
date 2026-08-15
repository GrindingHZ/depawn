# p5a-interest-and-payoff review

Fresh subagent review of `git diff db70d93..HEAD`. Verdict BLOCKED on two findings, with two notes.

## Findings

1. [blocking] `packages/contracts/src/lending.ts`: the repayment amount used the permissive
   `moneySchema` while every other client supplied amount in the codebase uses
   `positiveMoneySchema`. A borrower could post a USD amount against an AUD loan, which passes
   validation, reaches `Money.isLessThan`, and throws `CurrencyMismatchError`. That is not a
   `DomainError`, so the use case rethrows it and the filter turns it into a 500 rather than the
   CURRENCY_MISMATCH docs/04 names.
2. [blocking] No idempotency proof at the HTTP boundary for `POST /loans/:id/repay`. The race test
   drives the use case in process, which proves the row lock but bypasses the interceptor, the
   session, and DTO validation, so the endpoint's own exactly once guarantee was untested.
3. [note] A caller who is party to no loan gets 403 from repay, revealing the loan exists, while
   the read and quote endpoints deliberately return 404 for the same caller. This matches the
   sitewide `NotResourceOwner` convention rather than being introduced here.
4. [note] `Loan.canBeRepaid()` takes no argument while the docs/02 sketch passes the clock in.

Confirmed clean by the reviewer, having recomputed the arithmetic independently: the interest
formula matches docs/02 exactly and 250000 at 1800 basis points over 10 of 365 days really is 1232
minor units; flow 5 ordering and locking match step for step with the note holder resolved inside
the locked transaction; the staleness comparison cannot be tricked into over or undercharging and
correctly stops firing once a loan is past maturity; overpayment cannot overcharge because the
transfer always moves the computed total rather than the declared payment; and the test clock guard
sits on the module graph with the Playwright isolation holding.

## Fixes applied

1. `fix(api): restrict the repayment amount to positive aud` moves the field to
   `positiveMoneySchema`. The filter also learned to turn a `CurrencyMismatchError` into a 422
   CURRENCY_MISMATCH, so the whole class of currency faults stops surfacing as 500s rather than
   only the path this schema closed.
2. `test(api): replay a repayment through the endpoint` sends the same key twice through the real
   endpoint concurrently and asserts one REPAY_LOAN ledger transaction and a REPAID loan, accepting
   either 201 with an identical body or a 409 against the original still in flight. A second test
   proves a foreign currency amount is refused at validation with the loan untouched.
3. Finding 4 answered in a comment on the method: eligibility is purely a question of status,
   because a loan past maturity is still repayable and one past grace stays repayable until a note
   holder marks it defaulted, so the clock has nothing to decide. Finding 3 left alone as a
   sitewide convention rather than changed inside this slice.

Gates after the fixes: `pnpm check` exit 0, unit exit 0, repayment integration 7 of 7.
