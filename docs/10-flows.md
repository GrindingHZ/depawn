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
   `requestedDurationMs`, `requestedLifetimeMs`. Created as `DRAFT`, expiring one lifetime after the
   server clock, because a client that dates the expiry from its own clock disagrees with the server
   whenever the two drift. Server validates the requested principal
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

---

## Flow 12: wallet deposit and withdrawal

**Actors:** operations (deposit), member (withdrawal)
**Precondition:** Phase 1 has no payment rail; the platform float is the counterparty

### Steps

1. `POST /me/deposits` with `{ email?, amount }`, operations role only.
   > **─── transaction boundary ───**
   > Resolve the target account (the named email, or the caller when omitted; see Q-011).
   > `SettlementPort.transfer(platformFloat, target, amount)` writes the `DEPOSIT` ledger
   > transaction. The response carries the settlement reference.

2. `POST /me/withdrawals` with `{ amount }`.
   > **─── transaction boundary ───**
   > Lock the caller's available account, check the balance, and
   > `SettlementPort.transfer(caller, platformFloat, amount)` writes the `WITHDRAW` transaction.

Both writes sit behind the idempotency interceptor: the key is claimed before the handler runs,
a repeat replays the stored response, a concurrent duplicate gets 409, and a crashed claim stays
pending until it expires rather than ever executing twice.

### Failures

| Condition | Result |
|---|---|
| Caller lacks the operations role on deposit | 403 `FORBIDDEN` |
| Deposit target email unknown | 404 `NOT_FOUND` |
| Withdrawal beyond the available balance | 422 `INSUFFICIENT_FUNDS` |
| Same idempotency key, different payload | 409 `IDEMPOTENCY_KEY_REUSED` |

### Phase 3

Deposits and withdrawals become on and off ramp operations against the user's wallet; the float
account disappears from the user path and the ledger records the mirror entries from the indexer.

---

## Flow 13: editing the protocol parameters

**Actor:** operations

`GET /admin/protocol-parameters` answers what is in force now together with every version ever
written. `PUT` writes a new version with the instant it takes effect; nothing is ever updated in
place, so what applied on any past day stays answerable.

### Steps

1. Operations opens the parameters screen and sees the fees, the grace period, and the statutory
   holding period, with the full edit history beneath them.
2. A version is submitted with an effective instant. It may be in the future, in which case it is
   stored and waits.
3. The version row and its audit entry commit in one transaction. An edit nobody can trace to an
   operator would be worse than no edit at all.
4. Only after that commit does the process reload what it serves, because a rollback must not leave
   it answering with a version that never landed.

### What an edit cannot do

An edit never reaches a loan already originated. Everything a loan is judged by travels with it:
the principal, the rate, the duration, the maturity, the grace deadline, the origination fee it
paid, and the liquidation fee its sale will pay. That last one is the only term read long after
origination, which is why it is copied onto the loan rather than looked up when the sale settles.

### Failures

| Condition | Result |
|---|---|
| Caller lacks the operations role | 403 `FORBIDDEN` |
| A fee outside zero to ten thousand basis points | 400 `VALIDATION_FAILED` |
| Same idempotency key, different payload | 409 `IDEMPOTENCY_KEY_REUSED` |

### Phase 3

The parameters become a shared `Config` object mutated through an `AdminCap`. The effective date
becomes a field the Move code reads against the on chain clock, and the history becomes the chain's
own transaction history. Q-022 notes that a second api process would serve a stale copy until it
restarted; the shared object removes the question rather than answering it.

---

## Flow 14: draining the outbox

**Actor:** the api process, unattended

Every use case that publishes a domain event writes it to the outbox inside its own transaction, so
the event and the state change land together or not at all. A worker in the serving process drains
it every five seconds.

### Steps

1. The drain claims a batch: rows not yet published whose claim is absent or older than the
   visibility window, locked with `FOR UPDATE SKIP LOCKED` and stamped with the claim instant. The
   lock alone is not enough, because it releases the moment the claiming transaction commits.
2. Each claimed event is published, then marked delivered.
3. A failure releases the claim so the next drain retries it immediately rather than waiting out the
   window.
4. After five attempts the event moves to the dead letter table in one transaction, so the queue
   keeps moving and a human can see what gave up. `GET /admin/dead-letters` is where they see it.

Delivery is at least once, not exactly once: a crash between a successful publish and the delivered
mark republishes once the window expires. In Phase 1 the handler is a log line, so that costs
nothing. Q-023 records that a chain submission is a different matter.

### Phase 3

The handler becomes the chain submission and the indexer feeds events back the other way. The
claiming, the retry, and the dead letter table are already here, which is the point of building the
outbox before there is anywhere to publish to.

---

## Flow 15: moving the clock in a demo

**Actor:** operations, in a demo process only

A loan book with history cannot be built at one instant, and a clock cannot be asked to run
backwards, so the demo seed builds its story by moving time forwards and leaves it where it
finished. Two processes are involved, the seed and the one that serves the demo, so the offset has
to survive between them.

### Steps

1. `pnpm db:seed` empties the database, boots the application, and drives the whole story through
   the same endpoints the apps use, advancing the clock between acts.
2. Each advance writes the accumulated offset to the single `demo_clock` row.
3. `pnpm dev` starts the api in demo mode. `DemoClockAdapter` reads that row once at startup and
   adds the offset to the system clock from then on.
4. The parameters screen shows a clock control, because the health endpoint reports demo mode. An
   advance moves the process clock and writes the new offset down.

### What this is not

Three clocks exist and only one of them can be moved by whoever is holding it. Under test the
process gets an offset held in memory, so a suite leaves nothing behind. In a demo the offset is
written down. Everywhere else the system clock is the only source of time and the route that would
move it is absent from the application graph, not merely refused.

### Consequences worth naming

Sessions are measured against the same clock as everything else, so a jump longer than the session
lifetime signs everyone out. The runbook says so at the step where it happens rather than treating
it as a glitch. Ordinary development inherits the demo offset, which is recorded as Q-024.

### Phase 3

The chain has its own clock and nothing can move it. The seed becomes a set of transactions against
a local network, and a demo that needs time to pass either waits or uses the network's own
facilities. The domain is unaffected either way: it reads a `ClockPort` and always has.

---

## Flow 16: photographing an item and showing it

**Actors:** vault staff at intake, then anyone entitled to look

A collateralised marketplace that shows no collateral is asking for trust it has not earned. The
photographs have always been taken; until P8b nothing served them back.

### Taking one

1. Staff attach a photograph to an intake before it is sealed. Nothing else may attach one: the
   photograph is evidence that a named member of staff had the item in their hands on a given day,
   and a borrower supplied image would be a different kind of thing wearing the same clothes
   (Q-026).
2. The bytes decide what the file is. The name and the declared content type are both attacker
   controlled and neither is consulted. JPEG and PNG only, and SVG is deliberately refused: it is a
   document that can carry script, and serving one back from our own origin would be a foothold.
3. Nothing is hashed or written until the bytes pass. A refused upload leaves no file and no
   evidence entry.
4. What is accepted is stored under `intakes/{intakeId}/{sha256}` and the evidence item records the
   verified content type alongside the hash.

### Showing one

`GET /receipts/{receiptId}/photo` answers the bytes to:

- the holder, because the item is theirs
- vault staff and operations, because custody is their job
- any signed in account, but only while the item is on a published listing

An item resting privately in the vault is nobody else's business, which is why this is not simply
"any signed in account". Not visible answers exactly as not found does, so the status code cannot be
used to discover which receipts exist.

The response carries the type recorded at upload, `X-Content-Type-Options: nosniff` so no browser
second guesses it, and an immutable cache header, which is safe because the key is a content hash
and the answer for a given hash can never change.

### Phase 3

The receipt becomes an object on chain carrying the hash. The bytes stay off chain in every phase,
which is why the intake record has only ever stored a hash: what goes on chain is the commitment,
not the picture.
