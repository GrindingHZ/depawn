# p6a-default-and-claim brainstorm

## Goal

Flow 7: once grace has run out, the note holder can mark the loan defaulted and take the receipt.
This is the smaller half of P6; liquidation follows in p6b.

## What this slice adds

1. `Loan.markDefaulted(now)` returning Result, gated on ACTIVE and `now > graceEndsAt`, recording
   `defaultedAt` because that instant starts the statutory holding period clock. The loan table
   gains the column.
2. `MarkDefaultUseCase`: assert the caller holds the lender note, assert the gate, set DEFAULTED,
   emit LoanDefaulted.
3. `ClaimReceiptUseCase`: assert DEFAULTED and the caller holds the note, move the receipt to the
   claimant. `CustodyReceipt.claimDefault` already exists from P2 and lands the receipt IN_VAULT
   under the new holder, so the claimant can redeem it through flow 6 with no special case.
   CustodyPort needs a `claimReceipt` method so the use case does not reach past the port. Checked:
   the port today exposes only `transferReceipt`, which goes through `transferHolder` and is
   refused from ENCUMBERED, so the existing method cannot serve. Adding a port method means the
   shared contract suite in `packages/test-support` grows a case for it, which is the point of that
   suite: the Sui adapter will have to satisfy it too.
4. Endpoints `POST /loans/:id/default` and `POST /loans/:id/claim-receipt`, both note holder only.
5. Marketplace: the funded loans screen gains the two actions, enabled only once grace has passed.

## Decisions

- Rule S2 says marking a default must remain available while the system is paused. Pause does not
  exist until P7, so there is nothing to bypass yet; the P7 slice that introduces the switch owns
  the never block exit tests. Q-013 already records the same shape for origination.
- Flow 7 gives 403 for a caller who is not the note holder, which matches the repay endpoint and
  differs from the 404 the loan reads give. Stay consistent with the sibling write endpoints.
- `amountOwedToLender` for liquidation is principal plus interest accrued to maturity. Interest
  already stops at maturity, so `calculateAmountDue(anything past maturity)` is that figure and
  needs no separate function.

## Tests

- Domain: default refused before grace ends, allowed one millisecond after, refused twice, refused
  on a repaid loan.
- Integration: the full path from a matured loan to a claimed receipt the claimant then redeems,
  proving flow 7 step 3 joins up with flow 6.
- Concurrency: two default calls produce one DEFAULTED loan and one event; two claims move the
  receipt once.
- Playwright: a lender marks a default after the clock advances and claims the item. This spec
  moves the clock, so it belongs in the time travel project.
