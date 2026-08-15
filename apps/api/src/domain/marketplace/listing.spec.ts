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
import { Listing, allowedListingTransitions } from './listing';
import type { ListingStatus } from './listing';
import { Offer, allowedOfferTransitions } from './offer';
import type { OfferEvent, OfferStatus } from './offer';
import type { ProtocolParameters } from './protocol-parameters';

const aud = currencyOf('AUD');
const now = Instant.fromEpochMilliseconds(1_700_000_000_000n);
const later = now.plusMilliseconds(3_600_000n);

const parameters: ProtocolParameters = {
  maxLoanToValueBasisPointsByCategory: { BULLION: 6000 },
  maxAnnualPercentageRateBasisPoints: 4800,
  minimumOfferLifetimeMs: 600_000n,
  originationFeeBasisPoints: 200,
  liquidationFeeBasisPoints: 300,
  gracePeriodMs: 604_800_000n,
  statutoryHoldingPeriodMs: 2_592_000_000n,
  dualAppraisalThreshold: Money.of(10_000_000n, aud),
  notesTransferable: false,
};

const appraisedValue = Money.of(500_000n, aud);

function listingIn(status: ListingStatus, offers: readonly Offer[] = []): Listing {
  return Listing.restore({
    id: listingIdOf('LST1'),
    borrowerAccountId: accountIdOf('BORROWER'),
    receiptId: receiptIdOf('R1'),
    requestedPrincipal: Money.of(250_000n, aud),
    maxAnnualPercentageRateBasisPoints: 2400,
    requestedDurationMs: 2_592_000_000n,
    expiresAt: now.plusMilliseconds(86_400_000n),
    status,
    offers,
    version: 0,
  });
}

function offerIn(status: OfferStatus, id = 'OFF1', rate = 1800): Offer {
  return Offer.restore({
    id: offerIdOf(id),
    listingId: listingIdOf('LST1'),
    lenderAccountId: accountIdOf('LENDER'),
    principal: Money.of(250_000n, aud),
    annualPercentageRateBasisPoints: rate,
    durationMs: 2_592_000_000n,
    fundsHoldId: fundsHoldIdOf(`FH-${id}`),
    expiresAt: now.plusMilliseconds(86_400_000n),
    createdAt: now,
    status,
  });
}

describe('offer transitions', () => {
  const events: OfferEvent[] = ['accept', 'withdraw', 'expire', 'supersede'];
  const statuses: OfferStatus[] = ['PENDING', 'ACCEPTED', 'WITHDRAWN', 'EXPIRED', 'SUPERSEDED'];

  it('walks every state and event pair against the table', () => {
    for (const status of statuses) {
      for (const event of events) {
        const offer = offerIn(status);
        const result =
          event === 'accept'
            ? offer.accept()
            : event === 'withdraw'
              ? offer.withdraw()
              : event === 'expire'
                ? offer.expire()
                : offer.supersede();
        expect(result.ok, `${status} + ${event}`).toBe(
          allowedOfferTransitions[status].includes(event),
        );
      }
    }
  });
});

describe('listing transitions', () => {
  it('publishes only a draft and never an expired one', () => {
    expect(listingIn('DRAFT').publish(now).ok).toBe(true);
    expect(listingIn('ACTIVE').publish(now).ok).toBe(false);
    const expired = listingIn('DRAFT').publish(now.plusMilliseconds(999_999_999n));
    expect(expired.ok).toBe(false);
    if (!expired.ok) {
      expect(expired.error.code).toBe('LISTING_EXPIRED');
    }
  });

  it('keeps terminal states terminal', () => {
    expect(allowedListingTransitions.MATCHED).toHaveLength(0);
    expect(allowedListingTransitions.CANCELLED).toHaveLength(0);
    expect(allowedListingTransitions.EXPIRED).toHaveLength(0);
  });

  it('takes offers only while active and under both rate caps', () => {
    const draftRejected = listingIn('DRAFT').addOffer(
      offerIn('PENDING'),
      appraisedValue,
      'BULLION',
      parameters,
      now,
    );
    expect(draftRejected.ok).toBe(false);

    const aboveListingCap = listingIn('ACTIVE').addOffer(
      offerIn('PENDING', 'OFF2', 2401),
      appraisedValue,
      'BULLION',
      parameters,
      now,
    );
    expect(aboveListingCap.ok).toBe(false);
    if (!aboveListingCap.ok) {
      expect(aboveListingCap.error.code).toBe('RATE_ABOVE_MAXIMUM');
    }

    const accepted = listingIn('ACTIVE').addOffer(
      offerIn('PENDING'),
      appraisedValue,
      'BULLION',
      parameters,
      now,
    );
    expect(accepted.ok).toBe(true);
  });

  it('enforces the minimum offer lifetime on withdrawal', () => {
    const listing = listingIn('ACTIVE', [offerIn('PENDING')]);
    const early = listing.withdrawOffer(offerIdOf('OFF1'), accountIdOf('LENDER'), parameters, now);
    expect(early.ok).toBe(false);
    if (!early.ok) {
      expect(early.error.code).toBe('OFFER_WITHDRAWAL_TOO_EARLY');
    }

    const wrongLender = listing.withdrawOffer(
      offerIdOf('OFF1'),
      accountIdOf('OTHER'),
      parameters,
      later,
    );
    expect(wrongLender.ok).toBe(false);

    const allowed = listing.withdrawOffer(
      offerIdOf('OFF1'),
      accountIdOf('LENDER'),
      parameters,
      later,
    );
    expect(allowed.ok).toBe(true);
    if (allowed.ok) {
      expect(allowed.value.offer.status).toBe('WITHDRAWN');
    }
  });

  it('accepts an offer, supersedes the rest, and computes the fee split', () => {
    const listing = listingIn('ACTIVE', [
      offerIn('PENDING', 'WIN', 1800),
      offerIn('PENDING', 'LOSE-1', 2000),
      offerIn('WITHDRAWN', 'GONE', 2000),
    ]);
    const result = listing.acceptOffer(offerIdOf('WIN'), accountIdOf('BORROWER'), parameters, now);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.listing.status).toBe('MATCHED');
    expect(result.value.winningOffer.status).toBe('ACCEPTED');
    expect(result.value.supersededOfferIds).toEqual(['LOSE-1']);
    expect(result.value.originationFee.minorUnits).toBe(5000n);
    expect(result.value.disbursement.minorUnits).toBe(245_000n);
  });

  it('rejects acceptance by anyone but the borrower and after matching', () => {
    const listing = listingIn('ACTIVE', [offerIn('PENDING', 'WIN')]);
    const stranger = listing.acceptOffer(offerIdOf('WIN'), accountIdOf('OTHER'), parameters, now);
    expect(stranger.ok).toBe(false);
    if (!stranger.ok) {
      expect(stranger.error.code).toBe('FORBIDDEN');
    }

    const matched = listingIn('MATCHED', [offerIn('ACCEPTED', 'WIN')]);
    const again = matched.acceptOffer(offerIdOf('WIN'), accountIdOf('BORROWER'), parameters, now);
    expect(again.ok).toBe(false);
    if (!again.ok) {
      expect(again.error.code).toBe('LISTING_ALREADY_MATCHED');
    }
  });

  it('expires only past its expiry and supersedes pending offers', () => {
    const listing = listingIn('ACTIVE', [offerIn('PENDING')]);
    const early = listing.expire(now);
    expect(early.ok).toBe(false);

    const due = listing.expire(now.plusMilliseconds(999_999_999n));
    expect(due.ok).toBe(true);
    if (due.ok) {
      expect(due.value.listing.status).toBe('EXPIRED');
      expect(due.value.supersededOfferIds).toEqual(['OFF1']);
    }

    expect(listingIn('DRAFT').expire(now.plusMilliseconds(999_999_999n)).ok).toBe(false);
  });

  it('cancels without refunding: pending offers become superseded', () => {
    const listing = listingIn('ACTIVE', [offerIn('PENDING'), offerIn('WITHDRAWN', 'W')]);
    const cancelled = listing.cancel(accountIdOf('BORROWER'));
    expect(cancelled.ok).toBe(true);
    if (cancelled.ok) {
      expect(cancelled.value.listing.status).toBe('CANCELLED');
      expect(cancelled.value.supersededOfferIds).toEqual(['OFF1']);
    }
  });
});
