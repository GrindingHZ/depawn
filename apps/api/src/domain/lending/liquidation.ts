import type { ProtocolParameters } from '../marketplace/protocol-parameters';
import type {
  AccountId,
  FundsHoldId,
  LiquidationId,
  LoanId,
  ReceiptId,
} from '../shared/identifiers';
import type { Instant } from '../shared/instant';
import type { Money } from '../shared/money';
import { failure, ok } from '../shared/result';
import type { Result } from '../shared/result';
import { BidBelowReserve } from './bid-below-reserve';
import { HoldingPeriodActive } from './holding-period-active';
import { LiquidationNotOpen } from './liquidation-not-open';
import { LiquidationNotScheduled } from './liquidation-not-scheduled';

export type LiquidationStatus = 'SCHEDULED' | 'BIDDING' | 'SETTLED' | 'CANCELLED';

export type LiquidationEvent = 'open' | 'bid' | 'close' | 'cancel';

export const allowedLiquidationTransitions: Record<LiquidationStatus, readonly LiquidationEvent[]> =
  {
    SCHEDULED: ['open', 'cancel'],
    BIDDING: ['bid', 'close'],
    SETTLED: [],
    CANCELLED: [],
  };

export interface Bid {
  readonly id: string;
  readonly bidderAccountId: AccountId;
  readonly amount: Money;
  readonly fundsHoldId: FundsHoldId;
  readonly placedAt: Instant;
}

interface LiquidationFields {
  readonly id: LiquidationId;
  readonly loanId: LoanId;
  readonly receiptId: ReceiptId;
  readonly reservePrice: Money;
  readonly status: LiquidationStatus;
  readonly opensAt: Instant | null;
  readonly closesAt: Instant | null;
  readonly bids: readonly Bid[];
  readonly winningBidId: string | null;
  readonly version: number;
}

export interface AcceptedBid {
  readonly liquidation: Liquidation;
  readonly bid: Bid;
  readonly beatenBid: Bid | null;
}

export interface ClosedLiquidation {
  readonly liquidation: Liquidation;
  readonly winningBid: Bid;
}

export type BidRejected = LiquidationNotOpen | BidBelowReserve;

/* Rule L6 lives here: a defaulted item is not the lender's to sell until the
   statutory holding period has run, because the borrower's last chance is a
   legal obligation rather than a courtesy. */
export function canBeScheduled(
  defaultedAt: Instant,
  now: Instant,
  parameters: ProtocolParameters,
): Result<void, HoldingPeriodActive> {
  const holdingEndsAt = defaultedAt.plusMilliseconds(parameters.statutoryHoldingPeriodMs);
  if (now.isBefore(holdingEndsAt)) {
    return failure(new HoldingPeriodActive(holdingEndsAt));
  }
  return ok(undefined);
}

export class Liquidation {
  private constructor(private readonly fields: LiquidationFields) {}

  get id(): LiquidationId {
    return this.fields.id;
  }
  get loanId(): LoanId {
    return this.fields.loanId;
  }
  get receiptId(): ReceiptId {
    return this.fields.receiptId;
  }
  get reservePrice(): Money {
    return this.fields.reservePrice;
  }
  get status(): LiquidationStatus {
    return this.fields.status;
  }
  get opensAt(): Instant | null {
    return this.fields.opensAt;
  }
  get closesAt(): Instant | null {
    return this.fields.closesAt;
  }
  get bids(): readonly Bid[] {
    return this.fields.bids;
  }
  get winningBidId(): string | null {
    return this.fields.winningBidId;
  }
  get version(): number {
    return this.fields.version;
  }

  static schedule(input: {
    readonly id: LiquidationId;
    readonly loanId: LoanId;
    readonly receiptId: ReceiptId;
    readonly reservePrice: Money;
  }): Liquidation {
    return new Liquidation({
      ...input,
      status: 'SCHEDULED',
      opensAt: null,
      closesAt: null,
      bids: [],
      winningBidId: null,
      version: 0,
    });
  }

  static restore(fields: LiquidationFields): Liquidation {
    return new Liquidation(fields);
  }

  open(now: Instant, closesAt: Instant): Result<Liquidation, LiquidationNotScheduled> {
    if (!this.allows('open')) {
      return failure(new LiquidationNotScheduled());
    }
    return ok(new Liquidation({ ...this.fields, status: 'BIDDING', opensAt: now, closesAt }));
  }

  cancel(): Result<Liquidation, LiquidationNotScheduled> {
    if (!this.allows('cancel')) {
      return failure(new LiquidationNotScheduled());
    }
    return ok(new Liquidation({ ...this.fields, status: 'CANCELLED' }));
  }

  /* A bid must clear the reserve and beat the standing high bid, so the book
     only ever moves upwards and the beaten bidder can pull their funds back. */
  placeBid(bid: Bid, now: Instant): Result<AcceptedBid, BidRejected> {
    if (!this.allows('bid')) {
      return failure(new LiquidationNotOpen());
    }
    if (this.fields.closesAt !== null && !this.fields.closesAt.isAfter(now)) {
      return failure(new LiquidationNotOpen());
    }
    if (bid.amount.isLessThan(this.fields.reservePrice)) {
      return failure(new BidBelowReserve(this.fields.reservePrice));
    }
    const standing = this.highestBid();
    if (standing !== null && !bid.amount.isGreaterThan(standing.amount)) {
      return failure(new BidBelowReserve(standing.amount));
    }
    return ok({
      liquidation: new Liquidation({ ...this.fields, bids: [...this.fields.bids, bid] }),
      bid,
      beatenBid: standing,
    });
  }

  close(): Result<ClosedLiquidation, LiquidationNotOpen> {
    if (!this.allows('close')) {
      return failure(new LiquidationNotOpen());
    }
    const winning = this.highestBid();
    if (winning === null) {
      return failure(new LiquidationNotOpen());
    }
    return ok({
      liquidation: new Liquidation({
        ...this.fields,
        status: 'SETTLED',
        winningBidId: winning.id,
      }),
      winningBid: winning,
    });
  }

  highestBid(): Bid | null {
    return this.fields.bids.reduce<Bid | null>(
      (highest, bid) =>
        highest === null || bid.amount.isGreaterThan(highest.amount) ? bid : highest,
      null,
    );
  }

  allows(event: LiquidationEvent): boolean {
    return allowedLiquidationTransitions[this.fields.status].includes(event);
  }
}
