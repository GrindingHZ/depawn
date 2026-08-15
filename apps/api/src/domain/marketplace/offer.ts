import type { AccountId, FundsHoldId, ListingId, OfferId } from '../shared/identifiers';
import type { Instant } from '../shared/instant';
import type { Money } from '../shared/money';
import { failure, ok } from '../shared/result';
import type { Result } from '../shared/result';
import { OfferNotPending } from './offer-not-pending';

export type OfferStatus = 'PENDING' | 'ACCEPTED' | 'WITHDRAWN' | 'EXPIRED' | 'SUPERSEDED';

export type OfferEvent = 'accept' | 'withdraw' | 'expire' | 'supersede';

/* SUPERSEDED is not WITHDRAWN: a superseded offer's hold is still live and
   the lender reclaims it (rule M8, pull not push). */
export const allowedOfferTransitions: Record<OfferStatus, readonly OfferEvent[]> = {
  PENDING: ['accept', 'withdraw', 'expire', 'supersede'],
  ACCEPTED: [],
  WITHDRAWN: [],
  EXPIRED: [],
  SUPERSEDED: [],
};

interface OfferFields {
  readonly id: OfferId;
  readonly listingId: ListingId;
  readonly lenderAccountId: AccountId;
  readonly principal: Money;
  readonly annualPercentageRateBasisPoints: number;
  readonly durationMs: bigint;
  readonly fundsHoldId: FundsHoldId;
  readonly expiresAt: Instant;
  readonly createdAt: Instant;
  readonly status: OfferStatus;
}

export class Offer {
  private constructor(private readonly fields: OfferFields) {}

  get id(): OfferId {
    return this.fields.id;
  }
  get listingId(): ListingId {
    return this.fields.listingId;
  }
  get lenderAccountId(): AccountId {
    return this.fields.lenderAccountId;
  }
  get principal(): Money {
    return this.fields.principal;
  }
  get annualPercentageRateBasisPoints(): number {
    return this.fields.annualPercentageRateBasisPoints;
  }
  get durationMs(): bigint {
    return this.fields.durationMs;
  }
  get fundsHoldId(): FundsHoldId {
    return this.fields.fundsHoldId;
  }
  get expiresAt(): Instant {
    return this.fields.expiresAt;
  }
  get createdAt(): Instant {
    return this.fields.createdAt;
  }
  get status(): OfferStatus {
    return this.fields.status;
  }

  static place(fields: Omit<OfferFields, 'status'>): Offer {
    return new Offer({ ...fields, status: 'PENDING' });
  }

  static restore(fields: OfferFields): Offer {
    return new Offer(fields);
  }

  isExpired(now: Instant): boolean {
    return now.isAfter(this.fields.expiresAt);
  }

  accept(): Result<Offer, OfferNotPending> {
    return this.transition('accept', 'ACCEPTED');
  }

  withdraw(): Result<Offer, OfferNotPending> {
    return this.transition('withdraw', 'WITHDRAWN');
  }

  expire(): Result<Offer, OfferNotPending> {
    return this.transition('expire', 'EXPIRED');
  }

  supersede(): Result<Offer, OfferNotPending> {
    return this.transition('supersede', 'SUPERSEDED');
  }

  allows(event: OfferEvent): boolean {
    return allowedOfferTransitions[this.fields.status].includes(event);
  }

  private transition(event: OfferEvent, target: OfferStatus): Result<Offer, OfferNotPending> {
    if (!this.allows(event)) {
      return failure(new OfferNotPending());
    }
    return ok(new Offer({ ...this.fields, status: target }));
  }
}
