# 10: Flows

Each flow states its actors, preconditions, the atomic step boundaries, the events emitted, the
failure modes, and what the step becomes in Phase 3. The transaction boundary markers are load-bearing:
**everything inside one boundary is one database transaction now and one on-chain transaction later.**

---

## Flow 1: intake and receipt issuance

**Actors:** borrower (in person), vault operator, appraiser
**Precondition:** borrower has passed KYC and holds an account

### Steps

1. **Booking.** Borrower books an intake slot for a vault. Off-chain, ordinary CRUD.

2. **Identification.** Operator verifies government ID against the account. Records the verification
   with the staff member's identity. Audit log entry.

3. **Begin intake.** `POST /vaults/:id/intakes` creates an intake in `DRAFT`.

4. **Evidence capture.** Operator attaches photographs from every angle, serial numbers, hallmarks,
   weights, and test results. `PATCH /intakes/:id` repeatedly. Files go to object storage; the intake
   row holds their content hashes.

5. **Appraisal.** Appraiser records a valuation, the method used, comparable references, and their
   identity. `POST /intakes/:id/appraisals`. If `appraisedValue >= dualAppraisalThreshold`, a second
   independent appraisal is required before sealing.

6. **Physical sealing.** Item goes into a tamper-evident bag. The numbered seal is recorded.

7. **Seal the record.** `POST /intakes/:id/seal`.
   > **─── transaction boundary ───**
   > Canonicalise the intake record, compute `intakeRecordHash`, set status `SEALED`, write the audit
   > entry. The intake becomes immutable; every subsequent write is rejected.

8. **Issue the receipt.** `POST /intakes/:id/issue-receipt`.
   > **─── transaction boundary ───**
   > Check the vault exposure policy against the insured limit. Create the `CustodyReceipt` in
   > `IN_VAULT` with `holderAccountId = borrower`. Emit `ReceiptIssued`. Audit entry.

### Failures

| Condition | Result |
|---|---|
| Intake not sealed | 409 `INTAKE_NOT_SEALED` |
| Dual appraisal required and missing | 422 `DUAL_APPRAISAL_REQUIRED` |
| Vault exposure would exceed the insured limit | 422 `VAULT_INSURED_LIMIT_EXCEEDED` |
| Receipt already issued for this intake | 409, idempotent replay returns the original |

### Phase 3

Step 8 becomes `custody::issue_receipt(&CustodianCap, ...)` minting a `VaultReceipt` object and
transferring it to the borrower's address. The evidence bundle stays off chain; only
`intakeRecordHash` goes on. The exposure check becomes an `assert!` against a per-vault counter in
the `Config` object.

---

## Flow 2: listing

**Actor:** borrower
**Precondition:** holds a receipt in `IN_VAULT`

### Steps

1. `POST /listings` with `receiptId`, `requestedPrincipal`, `maxAnnualPercentageRateBasisPoints`,
   `requestedDurationMs`, `expiresAt`. Created as `DRAFT`. Server validates the requested principal
   against the LTV cap for the item's category and rejects immediately if it exceeds it; better to
   fail here than to let the borrower publish something no lender can legally fund.

2. `POST /listings/:id/publish`.
   > **─── transaction boundary ───**
   > Lock the receipt row. Assert `IN_VAULT` and holder is the borrower. Move the receipt into the
   > listing's control. Set the listing `ACTIVE`. Emit `ListingPublished`.

3. Cancellation: `POST /listings/:id/cancel`.
   > **─── transaction boundary ───**
   > Assert the listing is `ACTIVE` and has no `ACCEPTED` offer. Set `CANCELLED`. Return the receipt
   > to the borrower. Mark every `PENDING` offer `SUPERSEDED`. Do **not** refund; lenders reclaim.

### Failures

| Condition | Result |
|---|---|
| Receipt is `ENCUMBERED` | 409 `RECEIPT_ENCUMBERED` |
| Caller is not the receipt holder | 403 |
| Requested principal exceeds the LTV cap | 422 `LOAN_TO_VALUE_EXCEEDED` |
| System paused | 422 `SYSTEM_PAUSED` |

### Phase 3

Publishing moves the `VaultReceipt` object *into* a newly created shared `Listing` object. The
borrower cannot transfer or double-pledge it while it lives there, enforced by the type system rather
than by a status column.

---

## Flow 3: placing an offer

**Actor:** lender
**Precondition:** listing is `ACTIVE`, lender has sufficient available balance

### Steps

1. Lender opens the listing, sees the appraisal, category, vault, evidence, LTV ceiling, and the
   existing offer book ranked by total borrower cost.

2. `POST /listings/:id/offers` with `principal`, `annualPercentageRateBasisPoints`, `durationMs`,
   `expiresAt`.
   > **─── transaction boundary ───**
   > Assert listing `ACTIVE` and not expired. Assert rate `<= maxAnnualPercentageRateBasisPoints` on
   > the listing and `<= maxAnnualPercentageRateBasisPoints` in protocol parameters. Assert LTV.
   > `SettlementPort.hold(principal)`, which debits `USER_AVAILABLE` and credits `USER_HELD`. Create the
   > offer as `PENDING` with `fundsHoldId`. Emit `OfferPlaced`.

3. Withdrawal: `POST /listings/:id/offers/:offerId/withdraw`.
   > **─── transaction boundary ───**
   > Assert the caller is the lender. Assert `now >= createdAt + minimumOfferLifetimeMs`; this stops
   > a lender baiting a borrower and yanking the offer mid-acceptance. Set `WITHDRAWN`.
   > `SettlementPort.refundHold`. Emit `OfferWithdrawn`.

### Failures

| Condition | Result |
|---|---|
| Available balance below the principal | 422 `INSUFFICIENT_FUNDS` |
| Rate above the listing's maximum | 422 `RATE_ABOVE_MAXIMUM` |
| Principal above the LTV cap | 422 `LOAN_TO_VALUE_EXCEEDED` |
| Withdrawal within the minimum lifetime | 422 `OFFER_WITHDRAWAL_TOO_EARLY` |
| Listing already matched | 409 `LISTING_ALREADY_MATCHED` |

### Design note

Funds are held **at offer time**, not at acceptance. The alternative, signed intents funded on
acceptance, is more capital-efficient and is what most NFT lending protocols do. We reject it because
our borrower is a person standing at a counter who needs cash today, and an offer that can evaporate
at the moment of acceptance turns into an error message instead of money. Take the capital cost.

### Phase 3

The hold becomes a `Coin<USDC>` moved into an `Offer` stored as a dynamic object field on the shared
`Listing`. Withdrawal destructures the field and returns the coin.

---

## Flow 4: origination

**Actor:** borrower
**Precondition:** listing `ACTIVE`, target offer `PENDING` and unexpired

This is the most important operation in the product. Everything about it is one atomic step.

### Steps

`POST /listings/:id/offers/:offerId/accept`

> **─── transaction boundary: everything below is one transaction ───**
>
> 1. Lock the listing row `FOR UPDATE`. Assert `ACTIVE`, not expired, caller is the borrower.
> 2. Assert the offer is `PENDING` and not expired.
> 3. Re-check LTV against the receipt's appraised value. It was checked at offer time; check again in
>    case parameters changed.
> 4. Assert the system is not paused.
> 5. Compute `originationFee = principal × originationFeeBasisPoints / 10_000`, and
>    `disbursement = principal − originationFee`.
> 6. `SettlementPort.releaseHold(hold, [{ borrower, disbursement }, { platformFee, originationFee }])`.
>    One call, one balanced ledger transaction, one `SettlementRef`.
> 7. `CustodyPort.encumberReceipt(receiptId, loanId)`.
> 8. Create the `Loan`: `startedAt = now`, `maturesAt = now + durationMs`,
>    `graceEndsAt = maturesAt + gracePeriodMs`, status `ACTIVE`, storing the `SettlementRef`.
> 9. Mint the `LenderNote` to the offer's lender and the `BorrowerNote` to the borrower.
> 10. Set the offer `ACCEPTED`, the listing `MATCHED`.
> 11. Set every other `PENDING` offer on this listing to `SUPERSEDED`. **Do not refund them.**
> 12. Emit `LoanOriginated`.
>
> **─── end transaction ───**

### The pull-not-push decision

Step 11 marks losing offers superseded without returning their funds. Lenders reclaim via
`POST /me/offers/:id/reclaim`.

Why: a listing with two hundred offers cannot refund them all inside one on-chain transaction; gas
limits forbid it. If Phase 1 refunded eagerly and Phase 3 could not, users would experience a behavioural
regression at exactly the moment you are asking them to trust a new system. Build it as pull now.

The cost is a UX obligation: a persistent, unmissable banner in the marketplace app whenever an
account has reclaimable holds. Treat it as a Phase 3 slice requirement, not a nice-to-have.

### Failures

| Condition | Result |
|---|---|
| Another acceptance won the race | 409 `LISTING_ALREADY_MATCHED` |
| Offer withdrawn or expired in the meantime | 409 `OFFER_NOT_PENDING` |
| LTV cap tightened since the offer | 422 `LOAN_TO_VALUE_EXCEEDED` |
| System paused | 422 `SYSTEM_PAUSED` |
| Duplicate `Idempotency-Key` | 201 with the original response, one loan |

### Phase 3

One PTB: destructure the winning `Offer`, split the fee coin, transfer the disbursement to the
borrower, transfer the fee to the treasury, move the `VaultReceipt` from the `Listing` into a new
shared `Loan`, mint and transfer both note objects, emit the event. Losing offers stay as dynamic
fields until their lenders reclaim.

---

## Flow 5: servicing and repayment

**Actor:** borrower
**Precondition:** loan `ACTIVE`

### Steps

1. `GET /loans/:id/payoff-quote` → `{ principal, accruedInterest, total, quotedAt, validUntil }`.
   Interest is `calculateAccruedInterest(...)` evaluated at `ClockPort.now()`. The UI shows a
   countdown and refetches on expiry.

2. `POST /loans/:id/repay` with the quoted total and `quotedAt`.
   > **─── transaction boundary ───**
   > Lock the loan row. Assert `ACTIVE`. Recompute the amount due at `now`. If it differs from the
   > quote, reject with `PAYOFF_QUOTE_STALE` and return the new figure; never silently charge a
   > different amount. Resolve the current `LenderNote` holder. `SettlementPort.transfer(borrower →
   > noteHolder, total)`. Set the loan `REPAID`. `CustodyPort.releaseEncumbrance(receiptId)`. Return
   > the receipt to the borrower, `IN_VAULT`. Emit `LoanRepaid`.

### Failures

| Condition | Result |
|---|---|
| Loan already repaid | 409 `LOAN_NOT_ACTIVE` |
| Quote stale | 409 `PAYOFF_QUOTE_STALE`, with the current figure in `details` |
| Insufficient balance | 422 `INSUFFICIENT_FUNDS` |
| Amount below the total | 422 `REPAYMENT_AMOUNT_INSUFFICIENT` |

Partial repayment is out of scope for v1. Do not accept it silently.

### Phase 3

`loan::repay(loan, coin, lender_note_id, &clock, ctx)`. Payment goes to the note holder resolved on
chain. The `VaultReceipt` moves out of the `Loan` and back to the borrower, and the shared `Loan`
object is destructured and deleted.

---

## Flow 6: redemption

**Actors:** borrower, vault operator
**Precondition:** receipt `IN_VAULT`, held by the borrower, not encumbered

### Steps

1. `POST /receipts/:id/redemption-requests`.
   > **─── transaction boundary ───**
   > Assert `IN_VAULT` and holder is the caller. Burn the receipt → `RELEASED`. Create the redemption
   > request in `REQUESTED`, recording the burning account. Emit `RedemptionRequested`.

   The receipt burns **here**, at request time, not at the counter. The burn is the entitlement proof;
   the counter visit is identity verification.

2. Borrower attends the vault. Request appears in the vault console `/releases` queue.

3. `POST /redemption-requests/:id/verify`.
   > **─── transaction boundary ───**
   > Operator records ID verification against the intake KYC record and, in Phase 3, a signed
   > challenge via `IdentityPort.verifyControl`. Status → `VERIFIED`. Audit entry naming the staff
   > member.

4. `POST /redemption-requests/:id/release`.
   > **─── transaction boundary ───**
   > Assert `VERIFIED`. Record the seal number broken, the handover time, the staff member. Status →
   > `RELEASED`. Decrement vault exposure. Emit `ItemReleased`.

Two steps, not one, because in a dispute you need to know whether verification or handover was the
failure.

### Failures

| Condition | Result |
|---|---|
| Receipt encumbered | 409 `RECEIPT_ENCUMBERED` |
| Receipt already burned | 409 `RECEIPT_ALREADY_BURNED` |
| Release attempted before verification | 409 |

---

## Flow 7: default and claim

**Actor:** lender note holder
**Precondition:** loan `ACTIVE`, `now > graceEndsAt`

### Steps

1. `POST /loans/:id/default`.
   > **─── transaction boundary ───**
   > Assert `ACTIVE` and `now > graceEndsAt`. Set `DEFAULTED`, record `defaultedAt` (this starts the
   > statutory holding period clock). Emit `LoanDefaulted`.

2. `POST /loans/:id/claim-receipt`.
   > **─── transaction boundary ───**
   > Assert `DEFAULTED` and the caller holds the `LenderNote`. Transfer the receipt to the claimant,
   > status `IN_VAULT` under the new holder. Emit `ReceiptClaimedByLender`.

3. The claimant may now redeem the physical item themselves via Flow 6, or route it to Flow 8.

### Failures

| Condition | Result |
|---|---|
| Still within grace | 422 `GRACE_PERIOD_ACTIVE` |
| Not the note holder | 403 |
| Loan repaid before the claim | 409 `LOAN_NOT_ACTIVE` |

Note that step 1 must remain available while the system is paused (rule S2).

---

## Flow 8: liquidation

**Actors:** operations, bidders
**Precondition:** loan `DEFAULTED`, `now >= defaultedAt + statutoryHoldingPeriodMs`

### Steps

1. `POST /loans/:id/liquidations` with a reserve price.
   > **─── transaction boundary ───**
   > Assert the holding period has elapsed. Create the liquidation in `SCHEDULED`.

2. `POST /liquidations/:id/open` → `BIDDING`, sets `closesAt`.

3. `POST /liquidations/:id/bids`.
   > **─── transaction boundary ───**
   > Assert `BIDDING`, not closed, bid `>= reservePrice` and above the current high bid.
   > `SettlementPort.hold(bidAmount)`. Previous high bidder's hold becomes reclaimable; pull, again.

4. `POST /liquidations/:id/close`.
   > **─── transaction boundary ───**
   > Compute `amountOwedToLender = principal + accruedInterestAtMaturity`. Run
   > `distributeLiquidationProceeds` and apply the waterfall in one settlement:
   >
   > | Order | Recipient | Amount |
   > |---|---|---|
   > | 1 | Lender note holder | `min(proceeds, amountOwed)` |
   > | 2 | Platform fee revenue | `liquidationFee` on the remainder |
   > | 3 | Borrower | Surplus |
   > | 4 | Platform rounding | Remainder from integer division |
   >
   > Burn the receipt → `LIQUIDATED`. Set the loan `LIQUIDATED`. Emit `LiquidationSettled`. The
   > winning bidder gets a new receipt or takes physical delivery per your operating policy.

**Surplus returns to the borrower.** Whether this is legally required depends on jurisdiction and on
whether the arrangement is a pawn or a secured loan. Returning it is both the safer posture and the
better product. Do not make it configurable.

### Failures

| Condition | Result |
|---|---|
| Holding period not elapsed | 422 `HOLDING_PERIOD_ACTIVE` |
| Bid below reserve | 422 `BID_BELOW_RESERVE` |
| Bidding closed | 409 `LIQUIDATION_NOT_OPEN` |

### Test cases that must exist

Proceeds above the amount owed (surplus path), below it (lender takes a loss, no surplus, no fee on
nothing), and exactly equal (boundary). Each asserts distributions sum exactly to proceeds.

---

## Flow 9: reclaiming a superseded hold

**Actor:** lender

`POST /me/offers/:offerId/reclaim`
> **─── transaction boundary ───**
> Assert the offer is `SUPERSEDED` or `EXPIRED` and the caller is the lender. `refundHold`. Mark the
> hold reclaimed so a repeat is a no-op rather than a double refund.

Small flow, and the one most likely to be forgotten. Test the double-reclaim case explicitly.

---

## Flow 10: reconciliation

**Actor:** operations, plus a scheduled job

Runs nightly and on demand. For each vault, compares:

- Physical inventory count from the operator's scan
- Database receipts in `IN_VAULT` or `ENCUMBERED`
- *(Phase 3)* On-chain `VaultReceipt` objects for that vault

Any disagreement produces a drift row with the receipt id, the field, and the three values. Drift is
an incident, not a report line. Route it to a human.

Also reconciles the ledger: every account's derived balance against the sum of its entries, and the
global sum against zero.

This flow is what makes the custody claim credible to a lender, an auditor, or a regulator. Build it
in Phase 1 with two columns. It is not a Phase 3 feature.

---

## Flow 11: pause

**Actor:** operations

`POST /admin/pause` sets a flag checked at the entrance to specific use cases.

**Blocked while paused:** create listing, publish listing, place offer, accept offer, open
liquidation, place bid.

**Never blocked, under any circumstance:** repay, request redemption, verify, release, withdraw
offer, reclaim hold, mark default, claim receipt, close an already-open liquidation.

A pause that can trap a borrower's collateral or a lender's principal is itself an attack surface.
Each of the never-blocked paths gets its own test asserting it still works while paused.
