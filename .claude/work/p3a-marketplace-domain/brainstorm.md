# p3a-marketplace-domain brainstorm

## What this slice changes

The marketplace domain from `docs/02-domain-model.md`: `ProtocolParameters` (LTV table per item
category, maximum rate, minimum offer lifetime, origination fee, grace and holding periods, the
dual appraisal threshold that p2c bound ad hoc), the `Listing` aggregate owning its `Offer`s with
the explicit transition tables for both state machines, `addOffer` enforcing rules M3 to M6
structurally (the hold happens in the use case; the aggregate validates rate and LTV),
`withdrawOffer` enforcing the minimum lifetime, `acceptOffer` returning an `AcceptedOffer`
description without side effects (consumed by P4), `cancel` marking pending offers superseded,
`expire` transitions, `rankOffers` by total borrower cost then submission order, and
`assertWithinLoanToValue`. Unit tests walk both transition tables and the policies.

## Files touched

New under `apps/api/src/domain/marketplace/`: `protocol-parameters.ts`, `listing.ts`,
`offer.ts`, `rank-offers.ts`, `loan-to-value-policy.ts`, error files per rejection
(`ListingNotActive`, `ListingExpired`, `ListingAlreadyMatched`, `OfferNotPending`,
`OfferExpired`, `OfferWithdrawalTooEarly`, `LoanToValueExceeded`, `RateAboveMaximum`), and specs.
`domain/shared/identifiers.ts` already carries the ids.

## Approaches

Offers live inside the listing aggregate as docs/02 prescribes; the listing exposes them readonly
and every mutation flows through a listing method. `AcceptedOffer` carries the winning offer, the
fee split computed from parameters, and the superseded offer ids, so the P4 use case only
performs ports calls. Ranking computes total cost with the interest formula's integer arithmetic
inline (principal times rate times duration over the year constant), shared later with the
interest calculator through `MILLISECONDS_PER_YEAR` in the lending module when P4 lands.

## What could break

The p2c `DUAL_APPRAISAL_THRESHOLD` token stays until the parameters object is wired through the
custody module in p3b, recorded as a follow up there. Nothing else touches existing code.

## Ambiguity

Rule M5 checks LTV at offer creation and origination; the listing's requested principal is also
checked at listing creation per flow 2. All three share `assertWithinLoanToValue`. Offer expiry
defaults are the lender's stated `expiresAt`; no protocol default exists in the docs, so none is
invented.
