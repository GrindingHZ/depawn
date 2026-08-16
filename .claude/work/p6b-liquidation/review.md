# p6b-liquidation review

Fresh subagent review of `git diff 3d04621..HEAD`. Verdict BLOCKED on two findings, with five notes.

## Findings

1. [blocking] A beaten bidder's held funds had no way back. Bidding holds money and the entity
   reports a beaten bid, but nothing refunded it: no use case, no route, no client, no screen. Flow
   8 step 3 says the previous high bidder's hold becomes reclaimable and points at the flow 9 pull
   pattern. The brainstorm had flagged that a bid equivalent was needed and the plan never scheduled
   it, which is exactly the narrowing CLAUDE.md says to record rather than commit silently. Money
   stranded permanently.
2. [blocking] The test named "leaves a beaten bidder able to reclaim" never reclaimed anything. It
   asserted the hold was still HELD, which would pass in a world where reclaiming is impossible, so
   it gave cover to finding 1.
3. [note] The waterfall property test was tautological: the rounding line is computed as the
   difference, so the sum holds whatever the other three lines are. The real proof was the three
   worked examples.
4. [note] Q-019's resolution is sound. docs/03 also says a ledger amount is always positive, which
   is enforced three ways, so writing a zero entry would break the more fundamental rule.
5. [note] `Liquidation.close` never checks the clock against closesAt, so a sale can settle the
   moment a bid clears the reserve. Not forbidden anywhere, but it undercuts advertising a window.
6. [note] The role test named scheduling and closing but only exercised scheduling.
7. [note] Scheduling twice on one loan relied on the database unique constraint and would surface as
   a 500 rather than a domain error.

Confirmed clean by the reviewer: the waterfall order and amounts match docs/10 with real per
recipient assertions; rule L6's boundary is honest, using a strict comparison and testing the exact
instant the period ends; the close transaction locks the loan before the liquidation and before the
receipt, which is what serialises flow 7 and flow 8 against each other; Q-010's ReleaseReason is
minimal and pinned by a contract case both adapters must satisfy; and both race tests genuinely race
concurrent calls against Postgres.

## Fixes applied

1. `feat(liquidation): let a beaten bidder pull their funds back` adds ReclaimBidUseCase and
   `POST /liquidations/:id/bids/:bidId/reclaim`, mirroring the offer reclaim. The rule it encodes:
   the standing high bid of a live sale is still in play, the winning bid of a settled sale has
   already been spent, and everything else is the bidder's to take back.
2. `test(liquidation): prove the reclaim path and the split rule` replaces the hollow test with one
   that pulls the money back and checks the balance moves, that pulling the standing high bid is
   refused, that a repeat is a no op replaying one REFUND_HOLD rather than paying twice, and that a
   stranger cannot pull someone else's bid. A second test covers reclaiming after settlement and
   proves the winner cannot reclaim what the waterfall already spent. The same commit rewrites the
   property test to assert the actual split rule per recipient rather than the sum that the
   construction guarantees.
3. `fix(liquidation): answer a second sale instead of faulting` adds the duplicate guard, and the
   role test now exercises opening and closing as well as scheduling.
4. Finding 5 recorded as Q-020 rather than changed: the docs give no rule, and both readings have a
   cost worth someone deciding on deliberately.

Gates after the fixes: `pnpm check` exit 0, unit exit 0, liquidation integration 9 of 9.
