import type {
  ListingResponse,
  ListingSummary,
  OfferResponse,
  RankedOfferResponse,
} from '@depawn/contracts';
import type { Listing } from '../../../domain/marketplace/listing';
import type { Offer } from '../../../domain/marketplace/offer';
import type { RankedOffer } from '../../../domain/marketplace/rank-offers';
import type { ListingSummaryReadModel } from '../../../domain/ports/marketplace-queries.port';
import { toMoneyDto } from '../../shared/http/money.mapper';

function isoOf(epochMilliseconds: bigint): string {
  return new Date(Number(epochMilliseconds)).toISOString();
}

export function toListingResponse(listing: Listing): ListingResponse {
  return {
    id: listing.id,
    borrowerAccountId: listing.borrowerAccountId,
    receiptId: listing.receiptId,
    requestedPrincipal: toMoneyDto(listing.requestedPrincipal),
    maxAnnualPercentageRateBasisPoints: listing.maxAnnualPercentageRateBasisPoints,
    requestedDurationMs: Number(listing.requestedDurationMs),
    expiresAt: isoOf(listing.expiresAt.epochMilliseconds),
    status: listing.status,
  };
}

export function toOfferResponse(offer: Offer): OfferResponse {
  return {
    id: offer.id,
    listingId: offer.listingId,
    lenderAccountId: offer.lenderAccountId,
    principal: toMoneyDto(offer.principal),
    annualPercentageRateBasisPoints: offer.annualPercentageRateBasisPoints,
    durationMs: Number(offer.durationMs),
    expiresAt: isoOf(offer.expiresAt.epochMilliseconds),
    createdAt: isoOf(offer.createdAt.epochMilliseconds),
    status: offer.status,
  };
}

export function toRankedOfferResponse(ranked: RankedOffer): RankedOfferResponse {
  return {
    ...toOfferResponse(ranked.offer),
    totalCostToBorrower: toMoneyDto(ranked.totalCostToBorrower),
  };
}

export function toListingSummary(summary: ListingSummaryReadModel): ListingSummary {
  return {
    id: summary.id,
    borrowerAccountId: summary.borrowerAccountId,
    receiptId: summary.receiptId,
    requestedPrincipal: toMoneyDto(summary.requestedPrincipal),
    maxAnnualPercentageRateBasisPoints: summary.maxAnnualPercentageRateBasisPoints,
    requestedDurationMs: Number(summary.requestedDurationMs),
    expiresAt: isoOf(summary.expiresAt.epochMilliseconds),
    status: summary.status,
    appraisedValue: toMoneyDto(summary.appraisedValue),
    itemCategory: summary.itemCategory,
  };
}

export { domainErrorStatusFor as marketplaceStatusFor } from '../../shared/http/domain-error-status';
