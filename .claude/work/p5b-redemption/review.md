# p5b-redemption review

Fresh subagent review of `git diff 417d094..HEAD`. Verdict BLOCKED on one finding, with nine notes.

## Findings

1. [blocking] A second verification reported REDEMPTION_NOT_VERIFIED, whose message reads "has not
   been verified yet" about a request that had just been verified. The shared rejection helper only
   special cased RELEASED, so every other illegal move fell through to that error. Staff at a
   counter act on this message, so saying the opposite of what happened is worse than saying
   nothing. The domain test stopped at asserting the call failed and never checked the code, which
   is exactly the gap that let it ship.
2. [note] Flow 6 mechanics confirmed: the burn and the request creation are one transaction, verify
   and release are separate transactions with their own audit entries naming the staff account, and
   release before verify is a 409.
3. [note] No test covers flow 7 step 3, a lender who claimed collateral then redeeming it. The code
   path is holder based and correct by inspection, and p6a already plans that test.
4. [note] Requesting against a receipt you do not hold gives 403 while a missing receipt gives 404,
   which distinguishes existence. Inherited house pattern, not introduced here.
5. [note] The release race proof is genuine: a real FOR UPDATE lock, two concurrent calls over 20
   rounds, one success, one REDEMPTION_ALREADY_RELEASED, exactly one audit row. The partial unique
   index is correct Postgres and does prevent a second live request per receipt.
6. [note] The vault exposure claim checks out against the actual query: the sum covers IN_VAULT and
   ENCUMBERED, so the burn removes the item with no decrement needed.
7. [note] The intake spec's move from an exact exposure delta to a lower bound is a legitimate fix
   rather than a weakening: the vault is a shared mutable fixture across projects that run
   concurrently, and the marketplace races on it predate this slice, so the exact claim was already
   unsound. The new project ordering removes the burn overlap that made it fail.
8. [note] Idempotency keys are generated on mount and rotated on success in both apps, both counter
   steps state plainly what becomes immutable, and no raw colour or spacing values appear.
9. [note] docs/05 names a `/borrow/redemptions` route this slice does not build, folding status into
   the receipts screen instead, and the deviation was not recorded.
10. [note] An unrelated repayment currency literal fix rode along in the receipts commit.

## Fixes applied

1. `fix(custody): name a repeated verification for what it is` adds RedemptionAlreadyVerified and
   drops the shared helper, so each guard names the state it actually found: verifying a released
   request says released, verifying a verified one says verified, and releasing an unverified one
   still says unverified.
2. `test(custody): assert the repeated verification message` pins the code and asserts the message
   does not claim the opposite, at both the domain and the HTTP boundary, and adds the missing
   verification after release case.
3. Finding 9 recorded as Q-017 with the reasoning: a request has no life away from its receipt, so
   the status sits beside the receipt until redemptions grow fields of their own.
4. Findings 3, 4, 7, 8, 10 need no code change. Finding 10 is a commit hygiene deviation recorded
   here because commits are never amended.

Gates after the fixes: `pnpm check` exit 0, unit exit 0, redemption integration 7 of 7.
