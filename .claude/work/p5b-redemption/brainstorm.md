# p5b-redemption brainstorm

## Goal

Flow 6 end to end: a borrower whose receipt is free asks for the item back, and a vault operator
verifies identity and then hands it over as two separate recorded steps.

## What this slice adds

1. `domain/custody/redemption-request.ts`: REQUESTED to VERIFIED to RELEASED, with the exhaustive
   transition table, plus a repository port. No table exists yet, so a migration comes with it.
2. `RequestRedemptionUseCase`: one transaction. Assert the receipt is IN_VAULT and held by the
   caller, burn it to RELEASED, create the request recording the burning account, emit
   RedemptionRequested. The burn happens here, at request time, because the burn is the
   entitlement proof and the counter visit is only identity verification.
3. `VerifyRedemptionUseCase` and `ConfirmReleaseUseCase`, each its own transaction, each writing an
   audit entry naming the staff member. Release records the seal number broken and the handover
   time, and decrements vault exposure.
4. Endpoints: `POST /receipts/:id/redemption-requests`, `POST /redemption-requests/:id/verify`,
   `POST /redemption-requests/:id/release`, plus the queue read the console needs.
5. Marketplace: redemption status on the receipts screen. Vault console: `/releases` queue and
   `/releases/:requestId` with the two step verify then release.

## Decisions to make in the plan

- Flow 6 step 4 says decrement vault exposure. Checked: exposure is derived, not stored. The
  repository sums appraised values over receipts in IN_VAULT or ENCUMBERED, so burning the receipt
  to RELEASED at request time already drops it out of the sum. There is nothing to decrement and
  adding a stored counter would create a second source of truth that could disagree with the sum.
  The step is therefore satisfied by the burn, and the slice asserts the exposure fall in a test
  rather than writing code for it.
- The failure table gives 409 for a release attempted before verification but names no code. The
  narrowest reading is a new REDEMPTION_NOT_VERIFIED code registered in the shared error list.
- Identity verification in Phase 1 is an operator assertion; IdentityPort.verifyControl belongs to
  Phase 3. The verify endpoint records who asserted it, not a signature.

## Tests

- Domain: the transition table including every illegal move.
- Integration: the burn at request time, a second request on a burned receipt rejected, release
  before verify rejected, and the full three step path leaving the receipt RELEASED.
- Concurrency: two release confirmations produce one handover.
- Playwright: borrower requests, console verifies and releases, borrower sees the status change.
