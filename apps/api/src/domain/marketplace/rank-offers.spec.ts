import { describe, expect, it } from 'vitest';
import {
  accountIdOf,
  fundsHoldIdOf,
  listingIdOf,
  offerIdOf,
  receiptIdOf,
} from '../shared/identifiers';
import { Instant } from '../shared/instant';
import { Money, currencyOf } from '../shared/money';
import { Listing } from './listing';
import { Offer } from './offer';
import type { OfferStatus } from './offer';
import { rankOffers } from './rank-offers';

const aud = currencyOf('AUD');
const now = Instant.fromEpochMilliseconds(1_700_000_000_000n);

const listing = Listing.restore({
  id: listingIdOf('LST1'),
  borrowerAccountId: accountIdOf('BORROWER'),
  receiptId: receiptIdOf('R1'),
  requestedPrincipal: Money.of(250_000n, aud),
  maxAnnualPercentageRateBasisPoints: 4800,
  requestedDurationMs: 30n * 24n * 60n * 60n * 1000n,
  expiresAt: now.plusMilliseconds(86_400_000n),
  status: 'ACTIVE',
  offers: [],
  version: 0,
});

function offerWith(input: {
  id: string;
  principalMinorUnits: bigint;
  rateBasisPoints: number;
  createdAtOffsetMs?: bigint;
  status?: OfferStatus;
}): Offer {
  return Offer.restore({
    id: offerIdOf(input.id),
    listingId: listingIdOf('LST1'),
    lenderAccountId: accountIdOf(`L-${input.id}`),
    principal: Money.of(input.principalMinorUnits, aud),
    annualPercentageRateBasisPoints: input.rateBasisPoints,
    durationMs: 30n * 24n * 60n * 60n * 1000n,
    fundsHoldId: fundsHoldIdOf(`FH-${input.id}`),
    expiresAt: now.plusMilliseconds(86_400_000n),
    createdAt: now.plusMilliseconds(input.createdAtOffsetMs ?? 0n),
    status: input.status ?? 'PENDING',
  });
}

describe('rankOffers', () => {
  it('prefers the lower total cost, never the bigger principal', () => {
    const cheap = offerWith({ id: 'CHEAP', principalMinorUnits: 250_000n, rateBasisPoints: 1800 });
    const bigButDear = offerWith({
      id: 'BIG',
      principalMinorUnits: 300_000n,
      rateBasisPoints: 2400,
    });
    const ranked = rankOffers([bigButDear, cheap], listing);
    expect(ranked.map((entry) => entry.offer.id)).toEqual(['CHEAP', 'BIG']);
  });

  it('breaks cost ties by earliest submission', () => {
    const early = offerWith({ id: 'EARLY', principalMinorUnits: 250_000n, rateBasisPoints: 1800 });
    const late = offerWith({
      id: 'LATE',
      principalMinorUnits: 250_000n,
      rateBasisPoints: 1800,
      createdAtOffsetMs: 60_000n,
    });
    const ranked = rankOffers([late, early], listing);
    expect(ranked.map((entry) => entry.offer.id)).toEqual(['EARLY', 'LATE']);
  });

  it('ranks only pending offers and computes the cost with integer arithmetic', () => {
    const pending = offerWith({ id: 'P', principalMinorUnits: 250_000n, rateBasisPoints: 1800 });
    const withdrawn = offerWith({
      id: 'W',
      principalMinorUnits: 250_000n,
      rateBasisPoints: 100,
      status: 'WITHDRAWN',
    });
    const ranked = rankOffers([pending, withdrawn], listing);
    expect(ranked).toHaveLength(1);
    // 250000 * 1800 * 30 days / (10000 * 365 days), truncated.
    expect(ranked[0]?.totalCostToBorrower.minorUnits).toBe(3698n);
  });
});
