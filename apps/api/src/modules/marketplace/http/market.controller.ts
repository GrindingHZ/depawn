import { Controller, Get, Inject, Query } from '@nestjs/common';
import type { MarketIndexResponse, MarketTapeResponse } from '@depawn/contracts';
import { CLOCK_PORT } from '../../../domain/ports/clock.port';
import type { ClockPort } from '../../../domain/ports/clock.port';
import { MARKET_QUERIES } from '../../../domain/ports/market-queries.port';
import type { MarketQueries } from '../../../domain/ports/market-queries.port';
import { toMoneyDto } from '../../shared/http/money.mapper';

/* One window for everybody looking at the strip. A client choosing its own
   comparison period would let two readers disagree about which way a
   category moved, which is worse than a window neither of them picked. */
const defaultWindowMs = 3_600_000;
const maximumWindowMs = 604_800_000;
const defaultTapeLimit = 30;

function positiveIntegerOr(value: string | undefined, fallback: number, maximum: number): number {
  if (value === undefined) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.min(parsed, maximum);
}

/* Read only, and signed in. Nothing here writes, so nothing here is
   idempotency wrapped; a repeated read is already a repeated read. */
@Controller('market')
export class MarketController {
  constructor(
    @Inject(MARKET_QUERIES) private readonly queries: MarketQueries,
    @Inject(CLOCK_PORT) private readonly clock: ClockPort,
  ) {}

  @Get('index')
  async index(@Query('windowMs') windowMs?: string): Promise<MarketIndexResponse> {
    const window = positiveIntegerOr(windowMs, defaultWindowMs, maximumWindowMs);
    const categories = await this.queries.categoryIndex(this.clock.now(), BigInt(window));
    return {
      categories: categories.map((entry) => ({
        category: entry.category,
        liveListings: entry.liveListings,
        averageRateBasisPoints: entry.averageRateBasisPoints,
        previousAverageRateBasisPoints: entry.previousAverageRateBasisPoints,
      })),
      windowMs: window,
    };
  }

  @Get('tape')
  async tape(@Query('limit') limit?: string): Promise<MarketTapeResponse> {
    const events = await this.queries.recentActivity(
      positiveIntegerOr(limit, defaultTapeLimit, 100),
    );
    return {
      events: events.map((event) => ({
        at: new Date(Number(event.at.epochMilliseconds)).toISOString(),
        kind: event.kind,
        listingId: event.listingId,
        itemDescription: event.itemDescription,
        itemCategory: event.itemCategory,
        rateBasisPoints: event.rateBasisPoints,
        amount: toMoneyDto(event.amount),
      })),
    };
  }
}
