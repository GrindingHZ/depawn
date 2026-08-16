# p6b-liquidation verify

- pnpm check: exit 0
- pnpm test:unit: exit 0
- pnpm test:integration: exit 0 (22 files, 102 tests)
- pnpm test:e2e: exit 0 (18 tests, one new)

The integration suite now runs past ten minutes, mostly the six twenty round race tests, so it has
to be started in the background rather than waited on in one call.

## Flow 8 exit criteria

- The three cases docs/10 demands each assert per recipient minor units and a balanced ledger:
  proceeds above the debt pay the lender in full then the fee then the surplus to the borrower;
  proceeds below it give the lender everything with no fee on nothing and no surplus; proceeds
  exactly equal leave nothing over. A property test over 500 random arrangements asserts the split
  rule itself rather than the sum the construction guarantees.
- Rule L6 is enforced from defaultedAt, refused a day early and allowed at the instant the period
  ends.
- Rule L7 holds: the surplus always returns to the borrower and nothing makes that configurable.
- Funds are held at bid time. A bid below the reserve, or one that only matches the standing high
  bid, is refused and moves no money. A beaten bidder pulls their own funds back, a repeat replays
  one refund rather than paying twice, a stranger cannot pull someone else's bid, and the winning
  bid of a settled sale is refused because the waterfall already spent it.
- Twenty rounds each of racing bids and racing closes: one bid stands, one settlement, one
  SETTLE_LIQUIDATION transaction, one LIQUIDATED loan, ledger balanced every round.
- Scheduling, opening, and closing are refused to a member; a second sale on one loan is refused
  with a domain error rather than a database fault.
- The Playwright journey drives a defaulted loan through the admin screen: scheduled, opened, bid
  against, and settled, with both parties' balances checked afterwards.

## Notes carried forward

- Q-010 answered: releaseHold names its reason, and the contract suite pins it for the Sui adapter.
- Q-019: the waterfall computes the rounding line always; the settlement writes only the movements
  that move money, because the ledger has forbidden a zero amount entry since P1.
- Q-020: whether a sale may close before its window ends is undecided; today closesAt governs bids
  only.
- P6 is complete: the unhappy path is now as finished as the happy one.
