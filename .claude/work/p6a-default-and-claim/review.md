# p6a-default-and-claim review

Fresh subagent review of `git diff acfcc4d..HEAD`. Verdict BLOCKED on one finding, with six notes.

## Findings

1. [blocking] The claim endpoint answered LOAN_NOT_DEFAULTED for every loan that was not DEFAULTED,
   including one the borrower had already repaid. Flow 7 names LOAN_NOT_ACTIVE for exactly that
   case, and docs/04 makes the code the only thing clients may branch on. The case is reachable,
   because repayment does nothing to the lender note, and no test covered it.
2. [note] `GracePeriodActive` carries the deadline "because a lender told only that it is too early
   will ask when", but the controller never put it on the wire, unlike the sibling repay handler.
3. [note] The claim locks the loan row but not the receipt row, so correctness rests on every write
   path to an encumbered receipt taking the loan lock first. Sound today and proven by the race
   test, but an implicit cross aggregate coupling a future path could break silently.
4. [note] `Loan` had no invariant tying `defaultedAt` to the status, unlike CustodyReceipt, which
   guards its own pairing. `restore` trusted any combination from the row.
5. [note] Removing the client clock gate means the button is live for the whole term, so an early
   click costs a round trip and an error banner. Called a judgment call rather than a defect.
6. [note] The docs/02 receipt diagram still shows claimDefault staying ENCUMBERED, contradicting
   flow 7 and the implementation. Predates this slice as Q-012.
7. [note, positive] The grace boundary is honest: strict `isAfter`, with the exact instant rejected
   and one millisecond later accepted using real Instant arithmetic rather than a mocked clock. The
   new port method is justified over reusing transferReceipt, whose transition is refused from
   ENCUMBERED, and its contract cases assert the resulting holder, status, and cleared loan id.

## Fixes applied

1. `fix(lending): answer a claim on a closed loan as flow 7 names` splits the two answers: a live
   loan gets LOAN_NOT_DEFAULTED, a closed one gets LOAN_NOT_ACTIVE. The new code is recorded as
   Q-018, because flow 7 names no code for claiming against a healthy loan and stretching
   LOAN_NOT_ACTIVE to cover a live loan would have been false.
2. The same commit wires the grace deadline into the rejection details, matching the repay handler,
   and adds the missing Loan invariant: `defaultedAt` is set exactly when the loan has defaulted,
   which holds through LIQUIDATED because a liquidated loan defaulted first. That invariant
   immediately caught the table driven test fixture building loans that could never exist, which is
   the point of putting it in the constructor.
3. `test(lending): cover a claim after repayment and the deadline detail` proves the repaid case end
   to end with the receipt still the borrower's, asserts the deadline reaches the wire, and pins the
   reconstruction guard.
4. Finding 3 left alone: adding a second lock ordering without a demonstrated need risks deadlocks,
   and the race test proves the current serialisation. Recorded here for p6b, which adds another
   write path to the same receipt.
5. Finding 5 left alone. A coarser gate on maturity would reintroduce a client clock dependence with
   more slack rather than removing it, and the server already explains itself.
6. Finding 6 answered by updating Q-012 with the evidence this slice produced: the claim to
   redemption path only works because the receipt lands IN_VAULT, so the diagram is the side that
   needs correcting.

Gates after the fixes: `pnpm check` exit 0, unit exit 0, default and claim integration 8 of 8.

## An intermittent the verify gate caught

The e2e suite began failing roughly one run in three, always in the origination journey, with the
winning lender's funded loans empty seconds after an acceptance that named their account as the note
holder. Two candidate explanations: a broken read model, or a client side artefact.

The trace settled it. The lender loans request returned `{"items":[]}` at 470 milliseconds after the
accept, but the request came from the losing lender's page, and the winning lender's page issued no
loans request at all in the whole run. So the server was never asked. A direct probe against a live
api confirmed the read is correct: with two competing lenders, the winner sees the loan and the
loser sees nothing, five reads running. The spec now loads `/lend/loans` outright rather than
hopping there client side, which is what a lender returning to a page left open on the listing
actually does, and the assertion keeps its teeth because a missing loan would still fail it.

Chasing that flake surfaced a second one underneath. Receipt issuance started returning 422 across
the suite: two hundred receipts accumulated by repeated runs had filled the demo vault to exactly
its hundred million insured limit, so the exposure policy was refusing new intake, correctly. The
end to end suite now truncates before seeding, because specs can own their accounts but not the
vault they all share. Four consecutive full runs green afterwards.
