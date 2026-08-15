# Review: p3b-listings-api (base 39e0062, re-review after fix 50f8c07)

Mechanical results after the fix: pnpm check exit 0, pnpm test:unit exit 0,
scripts/check-boundaries.sh clean (214 modules, no violations). The fix commit message matches the
format; no em dashes, curly quotes, emoji, or banned phrasing in the diff. No test was modified or
weakened. Integration specs read, not run.

Verified sound (carried from the first pass): one unitOfWork.run per use case in all six use cases.
The place-offer probe runs the aggregate checks before the hold, matching flow 3's assert-then-hold
order; the placeholder hold id is never read by the checks, and the post-hold re-add uses the same
inputs and the same clock value, so the thrown-DomainError path is a defensive dead branch. The
throw-to-Result conversion is sound: a thrown DomainError (including InsufficientFunds from the
settlement adapter) rejects the Prisma transaction, rolls everything back, and is converted to a
failure outside the unit of work; non domain errors rethrow. The insufficient-funds spec asserts
zero offer and zero hold rows. Reclaim matches flow 9 for SUPERSEDED and EXPIRED and relies on the
funds hold row's exactly-once refund, proven by the double-reclaim spec asserting one REFUND_HOLD
transaction and an identical settlement reference. The 20-round race test pins exactly one success
per round and sums the ledger to zero. RECEIPT_ALREADY_LISTED and HOLD_NOT_RECLAIMABLE are
registered in packages/contracts error-codes.

## Blocking (resolved)

- Resolved by 50f8c07. MemberMarketplaceController no longer injects LISTING_REPOSITORY or
  UNIT_OF_WORK; the read moved into MyListingsQuery in the application layer, mirroring
  ListingDetailQuery and MemberReceiptsQuery, and the query is registered in
  marketplace-api.module.ts. The controller now takes only use cases, the new query, and the
  MarketplaceQueries port, satisfying the docs/09 HTTP layer rule.

## Non-blocking

- Publish does not lock the receipt row; flow 2's transaction boundary says to lock it, and
  CustodyReceiptRepository exposes no lock method. Nothing mutates a receipt concurrently today, so
  this is latent, but the redemption slice must add the lock or a live-listing guard, or a listed
  receipt can be burned while its listing stays ACTIVE.
- Two concurrent creates for the same receipt both pass findLiveByReceipt and hit the partial
  unique index; the Prisma P2002 is unmapped and surfaces as 500 FAULT instead of 409
  RECEIPT_ALREADY_LISTED. Safe (no duplicate row) but the wrong error contract.
- Scope narrowed against docs/04-api-contract.md without an OPEN-QUESTIONS entry: GET /listings
  ignores the documented status, category, and limit parameters (hardcoded ACTIVE, 25);
  GET /listings/:id/offers is absent (book embedded in detail); /me/listings and /me/offers are
  unpaginated. CLAUDE.md requires a docs/OPEN-QUESTIONS.md line when taking the narrowest reading.
- rankOffers filters on status PENDING only, so expired PENDING offers, including ones whose hold
  was already reclaimed through the expired-PENDING path, still appear in the public offer book;
  acceptance rejects them later, but the book misleads.
- The reclaim use case widens flow 9 to expired-PENDING offers without a status write. The code
  comment argues it soundly (acceptance rejects expired offers; the refunded hold blocks release),
  but flow 9 in docs/10-flows.md was not updated to record the widening.
- listing.receipt_id and offer.funds_hold_id carry no foreign keys; docs/09 says foreign keys
  always, and the slice added one for offer.listing_id. Account-id columns lack FKs repo-wide, but
  receipt and funds hold are same-domain tables with FK precedent (custody_receipt to vault).
- HOLD_NOT_RECLAIMABLE maps to 422, but a not-yet-reclaimable hold can become reclaimable after a
  refresh (supersession or expiry), which is the documented 409 semantic.
- GET /listings/:id is public and serves DRAFT and CANCELLED listings with the borrower account id
  while browse hides them; consider 404 for states not publicly visible.
- Test constant inAnHour in marketplace.integration.spec.ts is Date.now() + 3_600_000_000, which is
  1000 hours, not one.

## Verdict

APPROVED
