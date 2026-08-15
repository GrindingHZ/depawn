# p3b-listings-api brainstorm

## What this slice changes

Listings and offers reach Postgres and HTTP: a migration adding `listing` and `offer` tables plus
a partial unique index enforcing one `ACTIVE` listing per receipt (the Phase 1 stand in for rule
M2's "receipt in the listing's control"); a `ListingRepository` loading the aggregate with its
offers and saving both with the optimistic version check; `PROTOCOL_PARAMETERS` bound once in a
global module (replacing the ad hoc dual appraisal token from p2c); use cases for create, publish,
cancel, place offer (settlement hold inside the same transaction, rule M3), withdraw (refund),
and reclaim (rule M8, exactly once through the funds hold status); browse, detail with the ranked
offer book, my listings, and my offers queries; the endpoints from docs/04 minus accept (P4);
`ListingPublished`, `OfferPlaced`, and `OfferWithdrawn` outbox events; audit entries; and
integration tests including the concurrent double spend proof docs/06 names.

## Files touched

New: migration, `domain/marketplace/listing-repository.ts`, Prisma listing repository and mapper,
`infrastructure/parameters/protocol-parameters.module.ts`, `modules/marketplace/` (use cases,
queries, controllers, module), marketplace schemas and client in contracts, integration specs.

Modified: `custody-api.module.ts` (threshold from parameters), `app.module.ts`, contracts index.

## Approaches

The aggregate saves as one listing row plus per offer upserts inside the transaction; the
version check sits on the listing row alone because every offer mutation flows through a listing
method, making the listing row the aggregate's concurrency token. Publish re-checks the receipt
(`IN_VAULT`, held by the borrower) and relies on the partial unique index against double listing.
The reclaim use case allows `SUPERSEDED` and `EXPIRED` offers only and inherits exactly once
semantics from `refundHold`.

## What could break

The offer placement path must lock the listing row before adding the offer so a concurrent
acceptance in P4 cannot interleave; the lock lands now. The parameters swap in the custody module
must keep the p2c threshold value identical so the intake tests stay green.

## Ambiguity

Listing expiry is lazy: reads and mutations treat a past `expiresAt` as expired through the
aggregate guards, and a background expiry job is out of docs scope until P7's operations work.
