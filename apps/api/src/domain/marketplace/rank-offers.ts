import { Money } from '../shared/money';
import type { Listing } from './listing';
import type { Offer } from './offer';

/* The one year convention, fixed once: 365 days (docs/02-domain-model.md). */
export const MILLISECONDS_PER_YEAR = 365n * 24n * 60n * 60n * 1000n;

export interface RankedOffer {
  readonly offer: Offer;
  readonly totalCostToBorrower: Money;
}

/* Rank primarily by effective total cost to the borrower over the requested
   duration, then by earliest submission. Never by principal: rule M4 makes
   lenders compete on rate, and rewarding a bigger principal invites the
   winner's curse. Truncating division rounds the displayed cost down, the
   same direction as accrual. */
export function rankOffers(offers: readonly Offer[], listing: Listing): RankedOffer[] {
  return offers
    .filter((offer) => offer.status === 'PENDING')
    .map((offer) => ({
      offer,
      totalCostToBorrower: Money.of(
        (offer.principal.minorUnits *
          BigInt(offer.annualPercentageRateBasisPoints) *
          listing.requestedDurationMs) /
          (10_000n * MILLISECONDS_PER_YEAR),
        offer.principal.currency,
      ),
    }))
    .sort((left, right) => {
      if (!left.totalCostToBorrower.equals(right.totalCostToBorrower)) {
        return left.totalCostToBorrower.isLessThan(right.totalCostToBorrower) ? -1 : 1;
      }
      if (!left.offer.createdAt.equals(right.offer.createdAt)) {
        return left.offer.createdAt.isBefore(right.offer.createdAt) ? -1 : 1;
      }
      return 0;
    });
}
