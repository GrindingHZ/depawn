# p7a-pause-and-audit verify

- pnpm check: exit 0
- pnpm test:unit: exit 0
- pnpm test:integration: exit 0 (24 files, 124 tests)
- pnpm test:e2e: exit 0 (19 tests, one new)

## Flow 11 and rule S2

- The six entrances flow 11 blocks each refuse with SYSTEM_PAUSED and change nothing: creating a
  listing, publishing one, placing an offer, accepting one, opening a sale, and bidding on a sale.
  A refused offer takes no hold, so a paused market costs a lender nothing.
- The nine paths rule S2 protects each keep working while paused, asserted one per test as the
  phase plan requires: repay, request redemption, verify, release, withdraw an offer, reclaim a
  hold, mark a default, claim a receipt, and close a sale already taking bids. That last asymmetry
  is deliberate: stopping a sale half way would strand the bidder's money and the borrower's item.
- Pausing and unpausing are operations only and both audited, so the question of who stopped
  trading and why has an answer. The state itself is readable by any signed in account, which is
  what lets a member see why an offer was refused rather than guessing.
- Unpausing resumes business, proven by creating a listing afterwards.

## The audit trail

- Every state transition this slice touched now records both sides, which is P7's first bullet.
  Creations record no before, because there is nothing prior to record.
- The search composes its filters, is operations only, and pages with keyset pagination over
  monotonic ids: 28 entries walked across two pages with none repeated and none dropped.
- The route matches docs/04 after the review caught it diverging.

## Notes carried forward

- Q-013 is closed: the origination pause check deferred from P4 landed here.
- Q-021: the pause reason is visible to every signed in account, which is useful for a banner and
  risky for an internal note.
- The integration suite now runs past ten minutes and has to be started in the background.
