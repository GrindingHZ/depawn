import type { Listing as ListingRow, Offer as OfferRow } from '@prisma/client';
import { Listing } from '../../../domain/marketplace/listing';
import { Offer } from '../../../domain/marketplace/offer';
import {
  accountIdOf,
  fundsHoldIdOf,
  listingIdOf,
  offerIdOf,
  receiptIdOf,
} from '../../../domain/shared/identifiers';
import { Instant } from '../../../domain/shared/instant';
import { Money, currencyOf } from '../../../domain/shared/money';

function instantOf(value: Date): Instant {
  return Instant.fromEpochMilliseconds(BigInt(value.getTime()));
}

export function toOffer(row: OfferRow): Offer {
  return Offer.restore({
    id: offerIdOf(row.id),
    listingId: listingIdOf(row.listingId),
    lenderAccountId: accountIdOf(row.lenderAccountId),
    principal: Money.of(row.principalMinorUnits, currencyOf(row.currency)),
    annualPercentageRateBasisPoints: row.annualPercentageRateBasisPoints,
    durationMs: row.durationMs,
    fundsHoldId: fundsHoldIdOf(row.fundsHoldId),
    expiresAt: instantOf(row.expiresAt),
    createdAt: instantOf(row.offeredAt),
    status: row.status,
  });
}

export function toListing(row: ListingRow & { offers: OfferRow[] }): Listing {
  return Listing.restore({
    id: listingIdOf(row.id),
    borrowerAccountId: accountIdOf(row.borrowerAccountId),
    receiptId: receiptIdOf(row.receiptId),
    requestedPrincipal: Money.of(row.requestedPrincipalMinorUnits, currencyOf(row.currency)),
    maxAnnualPercentageRateBasisPoints: row.maxAnnualPercentageRateBasisPoints,
    requestedDurationMs: row.requestedDurationMs,
    expiresAt: instantOf(row.expiresAt),
    status: row.status,
    offers: row.offers.map(toOffer),
    version: row.version,
  });
}

export function toListingRow(listing: Listing): Omit<ListingRow, 'createdAt' | 'updatedAt'> {
  return {
    id: listing.id,
    borrowerAccountId: listing.borrowerAccountId,
    receiptId: listing.receiptId,
    requestedPrincipalMinorUnits: listing.requestedPrincipal.minorUnits,
    currency: listing.requestedPrincipal.currency,
    maxAnnualPercentageRateBasisPoints: listing.maxAnnualPercentageRateBasisPoints,
    requestedDurationMs: listing.requestedDurationMs,
    expiresAt: new Date(Number(listing.expiresAt.epochMilliseconds)),
    status: listing.status,
    version: listing.version,
  };
}

export function toOfferRow(offer: Offer): Omit<OfferRow, 'createdAt' | 'updatedAt'> {
  return {
    id: offer.id,
    listingId: offer.listingId,
    lenderAccountId: offer.lenderAccountId,
    principalMinorUnits: offer.principal.minorUnits,
    currency: offer.principal.currency,
    annualPercentageRateBasisPoints: offer.annualPercentageRateBasisPoints,
    durationMs: offer.durationMs,
    fundsHoldId: offer.fundsHoldId,
    expiresAt: new Date(Number(offer.expiresAt.epochMilliseconds)),
    offeredAt: new Date(Number(offer.createdAt.epochMilliseconds)),
    status: offer.status,
  };
}
