# p6b-liquidation brainstorm

## Goal

Flow 8: a defaulted item goes to sale, and the proceeds are split in a fixed order that always adds
up. This closes P6 and is the last money moving flow in the Web2 product.

## The part to get right first

`distributeLiquidationProceeds(proceeds, amountOwedToLender, parameters)` is a pure function and the
highest value test target in the slice. The waterfall from docs/10 flow 8:

| Order | Recipient | Amount |
|---|---|---|
| 1 | Lender note holder | min(proceeds, amountOwed) |
| 2 | Platform fee revenue | liquidationFee on the remainder |
| 3 | Borrower | Surplus |
| 4 | Platform rounding | Remainder from integer division |

The rounding line exists so the transaction balances exactly when integer division leaves a unit
behind, and docs/03 says it must never be omitted even when it is zero. The three cases docs/10
demands are proceeds above, below, and exactly equal to the amount owed, each asserting the
distributions sum to the proceeds exactly. A property test over random proceeds and debts is worth
adding beside them, because summing to the input is a law rather than three examples.

`amountOwedToLender` is principal plus interest accrued to maturity. Interest already stops at
maturity, so `loan.calculateAmountDue` at any instant past maturity is that figure and no new
function is needed.

## What else this slice adds

1. `Liquidation` entity: SCHEDULED to BIDDING to SETTLED, with CANCELLED off SCHEDULED, plus
   reservePrice, opensAt, closesAt, winningBidId, waterfallResult. `canBeScheduled` enforces rule L6
   against defaultedAt plus statutoryHoldingPeriodMs.
2. Bids with funds held at bid time, mirroring offers: the previous high bidder's hold becomes
   reclaimable and is pulled back rather than pushed, the same decision as rule M8.
3. `CloseLiquidationUseCase`: one transaction that runs the waterfall as a single settlement, burns
   the receipt to LIQUIDATED, sets the loan LIQUIDATED, and emits LiquidationSettled.
4. Endpoints per docs/04, operations only for scheduling and opening.
5. Admin app: a liquidations screen.

## Risks worth naming now

- Reclaiming a beaten bid reuses the offer reclaim shape but on a different aggregate, so the
  existing `holdOfOffer` helper does not fit and a bid equivalent is needed rather than a forced
  reuse.
- The receipt may be held by the borrower or by a lender who already claimed it, since flow 8 can
  run before or after flow 7. `burnForLiquidation` already allows both live states from P2, which
  Q-012 recorded, so this slice should confirm that rather than rediscover it.
- Q-010 recorded that releaseHold takes a fixed kind of ORIGINATE_LOAN. The liquidation settlement
  is a transfer plus a distribution, so either the port grows a kind or the adapter derives
  SETTLE_LIQUIDATION from the distribution shape. That question comes due here.
