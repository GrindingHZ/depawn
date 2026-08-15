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

const statusByCode: Record<string, number> = {
  NOT_FOUND: 404,
  FORBIDDEN: 403,
  LISTING_NOT_ACTIVE: 409,
  LISTING_NOT_DRAFT: 409,
  LISTING_ALREADY_MATCHED: 409,
  LISTING_EXPIRED: 409,
  OFFER_NOT_PENDING: 409,
  OFFER_EXPIRED: 409,
  RECEIPT_ALREADY_LISTED: 409,
  RECEIPT_NOT_IN_VAULT: 409,
  RECEIPT_ENCUMBERED: 409,
  LOAN_TO_VALUE_EXCEEDED: 422,
  RATE_ABOVE_MAXIMUM: 422,
  INSUFFICIENT_FUNDS: 422,
  OFFER_WITHDRAWAL_TOO_EARLY: 422,
  HOLD_NOT_RECLAIMABLE: 422,
};

export function marketplaceStatusFor(code: string): number {
  return statusByCode[code] ?? 422;
}
