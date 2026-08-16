# p6b-liquidation plan

Slice base: recorded at plan time. Flow 8 end to end, closing P6.

## Tasks

1. `feat(domain): add the liquidation waterfall`
   `domain/lending/liquidation-waterfall.ts`: `distributeLiquidationProceeds(proceeds,
   amountOwedToLender, borrower, noteHolder, parameters)` returning `Distribution[]` in the order
   docs/10 fixes. The rounding line is always present, even at zero, because docs/03 says it must
   never be omitted.
2. `test(domain): pin the waterfall at every split`
   The three cases docs/10 demands, each asserting the distributions sum exactly to the proceeds:
   proceeds above the amount owed, below it, and exactly equal. Plus a fast-check property that the
   sum equals the proceeds for any proceeds and any debt, which is the law the three cases sample.
3. `feat(domain): add the liquidation entity`
   SCHEDULED to BIDDING to SETTLED with CANCELLED off SCHEDULED, exported transition table,
   `canBeScheduled` enforcing rule L6 against defaultedAt plus statutoryHoldingPeriodMs, bids with
   reserve and high bid guards.
4. `test(domain): cover the liquidation transitions and the holding period`
5. `feat(db): add liquidation and bid tables`
6. `feat(persistence): add the liquidation repository`
7. `feat(settlement): let a release name its ledger kind`
   Answers Q-010. `releaseHold` takes the kind so liquidation writes SETTLE_LIQUIDATION rather than
   ORIGINATE_LOAN. The port contract suite grows a case, since the Sui adapter must honour it too.
8. `feat(liquidation): schedule, open, and bid`
   Three use cases. Bidding holds funds at bid time and leaves the beaten bidder's hold reclaimable,
   the same pull not push decision as rule M8.
9. `feat(liquidation): close a liquidation and settle the waterfall`
   One transaction: run the waterfall as a single settlement, burn the receipt to LIQUIDATED, set
   the loan LIQUIDATED, emit LiquidationSettled. The receipt may be held by the borrower or by a
   lender who already claimed it, and `burnForLiquidation` allows both live states.
10. `feat(api): expose the liquidation endpoints`
    Per docs/04, with scheduling and opening restricted to operations.
11. `test(api): settle a liquidation at a surplus, a loss, and exactly the amount owed`
    Three integration paths, each ending at a balanced ledger with the receipt LIQUIDATED and the
    loan LIQUIDATED. Plus the holding period rejection and a bid below reserve.
12. `test(api): race two closes and two bids`
13. `feat(admin): add the liquidations screen`
14. `test(e2e): run a liquidation to settlement`
15. Review by a fresh subagent, fixes as new commits, then the four gates and close P6.

## Notes

- `amountOwedToLender` is `loan.calculateAmountDue` at any instant past maturity, because interest
  already stops there. No new calculation.
- The close use case burns a receipt that p6a's claim may also touch. It takes the loan lock first,
  matching every other write path to an encumbered receipt, which is the invariant p6a's review
  asked this slice to honour or explain.
- Surplus returns to the borrower and is not configurable (docs/10).
