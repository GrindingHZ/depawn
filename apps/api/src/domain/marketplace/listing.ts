import type { ItemCategory } from '../custody/item-category';
import type { AccountId, ListingId, OfferId, ReceiptId } from '../shared/identifiers';
import type { Instant } from '../shared/instant';
import type { Money } from '../shared/money';
import { failure, ok } from '../shared/result';
import type { Result } from '../shared/result';
import { ListingAlreadyMatched } from './listing-already-matched';
import { ListingExpired } from './listing-expired';
import { ListingNotActive } from './listing-not-active';
import { ListingNotDraft } from './listing-not-draft';
import { assertWithinLoanToValue } from './loan-to-value-policy';
import type { LoanToValueExceeded } from './loan-to-value-exceeded';
import { NotResourceOwner } from './not-resource-owner';
import type { Offer } from './offer';
import { OfferExpired } from './offer-expired';
import { OfferNotFound } from './offer-not-found';
import type { OfferNotPending } from './offer-not-pending';
import { OfferWithdrawalTooEarly } from './offer-withdrawal-too-early';
import type { ProtocolParameters } from './protocol-parameters';
import { RateAboveMaximum } from './rate-above-maximum';

export type ListingStatus = 'DRAFT' | 'ACTIVE' | 'MATCHED' | 'CANCELLED' | 'EXPIRED';

export type ListingEvent = 'publish' | 'acceptOffer' | 'cancel' | 'expire';

export const allowedListingTransitions: Record<ListingStatus, readonly ListingEvent[]> = {
  DRAFT: ['publish', 'cancel'],
  ACTIVE: ['acceptOffer', 'cancel', 'expire'],
  MATCHED: [],
  CANCELLED: [],
  EXPIRED: [],
};

interface ListingFields {
  readonly id: ListingId;
  readonly borrowerAccountId: AccountId;
  readonly receiptId: ReceiptId;
  readonly requestedPrincipal: Money;
  readonly maxAnnualPercentageRateBasisPoints: number;
  readonly requestedDurationMs: bigint;
  readonly expiresAt: Instant;
  readonly status: ListingStatus;
  readonly offers: readonly Offer[];
  readonly version: number;
}

export type OfferRejected =
  ListingNotActive | ListingExpired | RateAboveMaximum | LoanToValueExceeded;

export type OfferWithdrawalRejected =
  OfferNotFound | NotResourceOwner | OfferNotPending | OfferWithdrawalTooEarly;

export type OfferAcceptanceRejected =
  | ListingNotActive
  | ListingAlreadyMatched
  | ListingExpired
  | NotResourceOwner
  | OfferNotFound
  | OfferNotPending
  | OfferExpired;

export type ListingCancellationRejected = ListingNotActive | NotResourceOwner;

/* What origination must perform, described without side effects. The P4 use
   case turns this into one settlement release, one encumbrance, and one loan
   row inside one transaction (docs/10-flows.md flow 4). */
export interface AcceptedOffer {
  readonly listing: Listing;
  readonly winningOffer: Offer;
  readonly originationFee: Money;
  readonly disbursement: Money;
  readonly supersededOfferIds: readonly OfferId[];
}

export class Listing {
  private constructor(private readonly fields: ListingFields) {}

  get id(): ListingId {
    return this.fields.id;
  }
  get borrowerAccountId(): AccountId {
    return this.fields.borrowerAccountId;
  }
  get receiptId(): ReceiptId {
    return this.fields.receiptId;
  }
  get requestedPrincipal(): Money {
    return this.fields.requestedPrincipal;
  }
  get maxAnnualPercentageRateBasisPoints(): number {
    return this.fields.maxAnnualPercentageRateBasisPoints;
  }
  get requestedDurationMs(): bigint {
    return this.fields.requestedDurationMs;
  }
  get expiresAt(): Instant {
    return this.fields.expiresAt;
  }
  get status(): ListingStatus {
    return this.fields.status;
  }
  get offers(): readonly Offer[] {
    return this.fields.offers;
  }
  get version(): number {
    return this.fields.version;
  }

  static draft(input: Omit<ListingFields, 'status' | 'offers' | 'version'>): Listing {
    return new Listing({ ...input, status: 'DRAFT', offers: [], version: 0 });
  }

  static restore(fields: ListingFields): Listing {
    return new Listing(fields);
  }

  isExpired(now: Instant): boolean {
    return now.isAfter(this.fields.expiresAt);
  }

  publish(now: Instant): Result<Listing, ListingNotDraft | ListingExpired> {
    if (!this.allows('publish')) {
      return failure(new ListingNotDraft());
    }
    if (this.isExpired(now)) {
      return failure(new ListingExpired());
    }
    return ok(new Listing({ ...this.fields, status: 'ACTIVE' }));
  }

  addOffer(
    offer: Offer,
    appraisedValue: Money,
    category: ItemCategory,
    parameters: ProtocolParameters,
    now: Instant,
  ): Result<Listing, OfferRejected> {
    const active = this.assertAcceptingOffers(now);
    if (!active.ok) {
      return active;
    }
    if (
      offer.annualPercentageRateBasisPoints > this.fields.maxAnnualPercentageRateBasisPoints ||
      offer.annualPercentageRateBasisPoints > parameters.maxAnnualPercentageRateBasisPoints
    ) {
      return failure(new RateAboveMaximum());
    }
    const withinLoanToValue = assertWithinLoanToValue(
      offer.principal,
      appraisedValue,
      category,
      parameters,
    );
    if (!withinLoanToValue.ok) {
      return withinLoanToValue;
    }
    return ok(new Listing({ ...this.fields, offers: [...this.fields.offers, offer] }));
  }

  withdrawOffer(
    offerId: OfferId,
    requestedBy: AccountId,
    parameters: ProtocolParameters,
    now: Instant,
  ): Result<{ listing: Listing; offer: Offer }, OfferWithdrawalRejected> {
    const offer = this.fields.offers.find((candidate) => candidate.id === offerId);
    if (offer === undefined) {
      return failure(new OfferNotFound());
    }
    if (offer.lenderAccountId !== requestedBy) {
      return failure(new NotResourceOwner());
    }
    if (now.millisecondsSince(offer.createdAt) < parameters.minimumOfferLifetimeMs) {
      return failure(new OfferWithdrawalTooEarly());
    }
    const withdrawn = offer.withdraw();
    if (!withdrawn.ok) {
      return withdrawn;
    }
    return ok({ listing: this.replaceOffer(withdrawn.value), offer: withdrawn.value });
  }

  acceptOffer(
    offerId: OfferId,
    requestedBy: AccountId,
    parameters: ProtocolParameters,
    now: Instant,
  ): Result<AcceptedOffer, OfferAcceptanceRejected> {
    if (this.fields.status === 'MATCHED') {
      return failure(new ListingAlreadyMatched());
    }
    const active = this.assertAcceptingOffers(now);
    if (!active.ok) {
      return active;
    }
    if (requestedBy !== this.fields.borrowerAccountId) {
      return failure(new NotResourceOwner());
    }
    const offer = this.fields.offers.find((candidate) => candidate.id === offerId);
    if (offer === undefined) {
      return failure(new OfferNotFound());
    }
    if (offer.isExpired(now)) {
      return failure(new OfferExpired());
    }
    const accepted = offer.accept();
    if (!accepted.ok) {
      return accepted;
    }

    const supersededOfferIds: OfferId[] = [];
    const offers = this.fields.offers.map((candidate) => {
      if (candidate.id === offerId) {
        return accepted.value;
      }
      const superseded = candidate.supersede();
      if (superseded.ok) {
        supersededOfferIds.push(candidate.id);
        return superseded.value;
      }
      return candidate;
    });

    const originationFee = accepted.value.principal.multiplyByBasisPoints(
      parameters.originationFeeBasisPoints,
    );
    return ok({
      listing: new Listing({ ...this.fields, status: 'MATCHED', offers }),
      winningOffer: accepted.value,
      originationFee,
      disbursement: accepted.value.principal.minus(originationFee),
      supersededOfferIds,
    });
  }

  cancel(
    requestedBy: AccountId,
  ): Result<
    { listing: Listing; supersededOfferIds: readonly OfferId[] },
    ListingCancellationRejected
  > {
    if (!this.allows('cancel')) {
      return failure(new ListingNotActive());
    }
    if (requestedBy !== this.fields.borrowerAccountId) {
      return failure(new NotResourceOwner());
    }
    const { offers, supersededOfferIds } = this.supersedePending();
    return ok({
      listing: new Listing({ ...this.fields, status: 'CANCELLED', offers }),
      supersededOfferIds,
    });
  }

  expire(
    now: Instant,
  ): Result<{ listing: Listing; supersededOfferIds: readonly OfferId[] }, ListingNotActive> {
    if (!this.allows('expire') || !this.isExpired(now)) {
      return failure(new ListingNotActive());
    }
    const { offers, supersededOfferIds } = this.supersedePending();
    return ok({
      listing: new Listing({ ...this.fields, status: 'EXPIRED', offers }),
      supersededOfferIds,
    });
  }

  allows(event: ListingEvent): boolean {
    return allowedListingTransitions[this.fields.status].includes(event);
  }

  private assertAcceptingOffers(now: Instant): Result<void, ListingNotActive | ListingExpired> {
    if (this.fields.status !== 'ACTIVE') {
      return failure(new ListingNotActive());
    }
    if (this.isExpired(now)) {
      return failure(new ListingExpired());
    }
    return ok(undefined);
  }

  private supersedePending(): {
    offers: readonly Offer[];
    supersededOfferIds: readonly OfferId[];
  } {
    const supersededOfferIds: OfferId[] = [];
    const offers = this.fields.offers.map((offer) => {
      const superseded = offer.supersede();
      if (superseded.ok) {
        supersededOfferIds.push(offer.id);
        return superseded.value;
      }
      return offer;
    });
    return { offers, supersededOfferIds };
  }

  private replaceOffer(updated: Offer): Listing {
    return new Listing({
      ...this.fields,
      offers: this.fields.offers.map((offer) => (offer.id === updated.id ? updated : offer)),
    });
  }
}
