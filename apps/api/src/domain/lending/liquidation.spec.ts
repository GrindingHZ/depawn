import { describe, expect, it } from 'vitest';
import type { ProtocolParameters } from '../marketplace/protocol-parameters';
import {
  accountIdOf,
  fundsHoldIdOf,
  liquidationIdOf,
  loanIdOf,
  receiptIdOf,
} from '../shared/identifiers';
import { Instant } from '../shared/instant';
import { Money, currencyOf } from '../shared/money';
import { Liquidation, allowedLiquidationTransitions, canBeScheduled } from './liquidation';
import type { Bid, LiquidationEvent, LiquidationStatus } from './liquidation';

const aud = currencyOf('AUD');
const now = Instant.fromEpochMilliseconds(1_700_000_000_000n);
const oneDay = 24n * 60n * 60n * 1000n;
const closesAt = now.plusMilliseconds(7n * oneDay);
const parameters = { statutoryHoldingPeriodMs: 30n * oneDay } as ProtocolParameters;

function scheduled(): Liquidation {
  return Liquidation.schedule({
    id: liquidationIdOf('LIQ-1'),
    loanId: loanIdOf('LOAN-1'),
    receiptId: receiptIdOf('RCP-1'),
    reservePrice: Money.of(200_000n, aud),
  });
}

function bidOf(id: string, minorUnits: bigint, bidder = 'BIDDER-1'): Bid {
  return {
    id,
    bidderAccountId: accountIdOf(bidder),
    amount: Money.of(minorUnits, aud),
    fundsHoldId: fundsHoldIdOf(`HOLD-${id}`),
    placedAt: now,
  };
}

function bidding(): Liquidation {
  const opened = scheduled().open(now, closesAt);
  if (!opened.ok) {
    throw new Error('a scheduled liquidation must open');
  }
  return opened.value;
}

describe('canBeScheduled', () => {
  const defaultedAt = now;

  it('refuses a sale inside the statutory holding period', () => {
    const result = canBeScheduled(defaultedAt, now.plusMilliseconds(29n * oneDay), parameters);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('HOLDING_PERIOD_ACTIVE');
      expect(result.error.holdingEndsAt.epochMilliseconds).toBe(
        defaultedAt.plusMilliseconds(30n * oneDay).epochMilliseconds,
      );
    }
  });

  it('allows a sale the moment the period elapses', () => {
    // The borrower has had the whole period, so the instant it ends the item
    // becomes sellable rather than a millisecond later.
    const result = canBeScheduled(
      defaultedAt,
      defaultedAt.plusMilliseconds(30n * oneDay),
      parameters,
    );
    expect(result.ok).toBe(true);
  });
});

describe('Liquidation', () => {
  it('opens with a closing time and takes no bids before that', () => {
    const liquidation = bidding();
    expect(liquidation.status).toBe('BIDDING');
    expect(liquidation.closesAt?.equals(closesAt)).toBe(true);
    expect(liquidation.highestBid()).toBeNull();
  });

  it('refuses a bid below the reserve', () => {
    const result = bidding().placeBid(bidOf('B1', 199_999n), now);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('BID_BELOW_RESERVE');
    }
  });

  it('accepts a bid at exactly the reserve', () => {
    const result = bidding().placeBid(bidOf('B1', 200_000n), now);
    expect(result.ok).toBe(true);
  });

  it('refuses a bid that only matches the standing high bid', () => {
    const first = bidding().placeBid(bidOf('B1', 250_000n), now);
    if (!first.ok) {
      throw new Error('the first bid must stand');
    }
    const matching = first.value.liquidation.placeBid(bidOf('B2', 250_000n, 'BIDDER-2'), now);
    expect(matching.ok).toBe(false);
    if (!matching.ok) {
      expect(matching.error.code).toBe('BID_BELOW_RESERVE');
    }
  });

  it('names the beaten bidder so their hold can be pulled back', () => {
    const first = bidding().placeBid(bidOf('B1', 250_000n), now);
    if (!first.ok) {
      throw new Error('the first bid must stand');
    }
    const second = first.value.liquidation.placeBid(bidOf('B2', 260_000n, 'BIDDER-2'), now);
    if (!second.ok) {
      throw new Error('a higher bid must stand');
    }
    expect(second.value.beatenBid?.id).toBe('B1');
    expect(second.value.liquidation.highestBid()?.id).toBe('B2');
  });

  it('refuses a bid once the closing time has passed', () => {
    const result = bidding().placeBid(bidOf('B1', 250_000n), closesAt);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('LIQUIDATION_NOT_OPEN');
    }
  });

  it('settles on the highest bid', () => {
    const first = bidding().placeBid(bidOf('B1', 250_000n), now);
    if (!first.ok) {
      throw new Error('the first bid must stand');
    }
    const second = first.value.liquidation.placeBid(bidOf('B2', 300_000n, 'BIDDER-2'), now);
    if (!second.ok) {
      throw new Error('a higher bid must stand');
    }

    const closed = second.value.liquidation.close();
    if (!closed.ok) {
      throw new Error('a liquidation with bids must close');
    }
    expect(closed.value.liquidation.status).toBe('SETTLED');
    expect(closed.value.winningBid.id).toBe('B2');
    expect(closed.value.liquidation.winningBidId).toBe('B2');
  });

  it('refuses to close with no bids at all', () => {
    const result = bidding().close();
    expect(result.ok).toBe(false);
  });

  it('refuses a second close', () => {
    const first = bidding().placeBid(bidOf('B1', 250_000n), now);
    if (!first.ok) {
      throw new Error('the first bid must stand');
    }
    const closed = first.value.liquidation.close();
    if (!closed.ok) {
      throw new Error('a liquidation with bids must close');
    }
    expect(closed.value.liquidation.close().ok).toBe(false);
  });

  it('cancels only while scheduled', () => {
    expect(scheduled().cancel().ok).toBe(true);
    expect(bidding().cancel().ok).toBe(false);
  });
});

describe('allowedLiquidationTransitions', () => {
  const everyEvent: readonly LiquidationEvent[] = ['open', 'bid', 'close', 'cancel'];
  const expected: Record<LiquidationStatus, readonly LiquidationEvent[]> = {
    SCHEDULED: ['open', 'cancel'],
    BIDDING: ['bid', 'close'],
    SETTLED: [],
    CANCELLED: [],
  };

  it.each(Object.entries(expected))('%s allows exactly %j', (status, events) => {
    const liquidation = Liquidation.restore({
      id: liquidationIdOf('LIQ-1'),
      loanId: loanIdOf('LOAN-1'),
      receiptId: receiptIdOf('RCP-1'),
      reservePrice: Money.of(200_000n, aud),
      status: status as LiquidationStatus,
      opensAt: null,
      closesAt: null,
      bids: [],
      winningBidId: null,
      version: 0,
    });
    for (const event of everyEvent) {
      expect(liquidation.allows(event)).toBe(events.includes(event));
    }
    expect(allowedLiquidationTransitions[status as LiquidationStatus]).toEqual(events);
  });
});
