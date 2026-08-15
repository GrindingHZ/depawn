# p6a-default-and-claim plan

Slice base: recorded at plan time. Flow 7 end to end.

## Tasks

1. `feat(domain): let a loan be marked defaulted`
   `Loan.markDefaulted(now)` returning Result, gated on ACTIVE and `now > graceEndsAt`, recording
   `defaultedAt`. New `GracePeriodActive` and reuse of `LoanNotActive`. The field joins LoanFields
   and the row, because that instant starts the statutory holding period.
2. `test(domain): pin the grace gate`
   Refused during grace, refused at exactly graceEndsAt, allowed one millisecond after, refused on
   a repaid loan, refused twice.
3. `feat(db): record when a loan defaulted`
   Nullable column plus migration; the mapper carries it both ways.
4. `feat(custody): let a note holder claim the collateral`
   `CustodyPort.claimReceipt(receiptId, claimant)` delegating to the entity's existing claimDefault,
   which lands the receipt IN_VAULT under the new holder. The shared contract suite in
   `packages/test-support` grows a case, since the Sui adapter must satisfy it too.
5. `feat(lending): add the default and claim use cases`
   Two use cases, each one transaction. Both assert the caller holds the lender note, resolved
   inside the transaction. Default emits LoanDefaulted; claim emits ReceiptClaimedByLender.
6. `feat(api): expose the default and claim endpoints`
   `POST /loans/:id/default` and `POST /loans/:id/claim-receipt`, idempotent, note holder only.
   Status mapping: GRACE_PERIOD_ACTIVE 422, LOAN_NOT_ACTIVE 409, FORBIDDEN 403.
7. `test(api): carry a loan from default to a claimed item`
   Integration: advance past grace, mark default, claim, then redeem the claimed receipt through
   flow 6 to prove step 3 joins up. Also the refusals: during grace, by a non holder, on a repaid
   loan, and claiming before the default.
8. `test(api): race two defaults and two claims`
   Twenty rounds each: one DEFAULTED loan and one event, one receipt movement.
9. `feat(marketplace): add the default and claim actions`
   The funded loans screen gains both, enabled only once grace has passed, with the dates that
   explain why. A claimed receipt then shows up under the lender's own receipts.
10. `test(e2e): a lender takes the collateral after default`
    Playwright, in the time travel project because it moves the clock.
11. Review by a fresh subagent, fixes as new commits, then the four gates and close.

## Notes

- Rule S2 keeps default available while paused. Pause arrives in P7 and that slice owns the never
  block exit tests, the same shape as Q-013 for origination.
- Interest already stops at maturity, so the amount owed a lender at liquidation is
  `calculateAmountDue` at any instant past maturity and needs no separate function. p6b uses it.
- The claim moves custody only. No money moves in flow 7, so no ledger transaction is written and
  the ledger assertions in this slice are about nothing changing.
