import type { ItemCategory } from '../custody/item-category';
import type { ListingId } from '../shared/identifiers';
import type { Instant } from '../shared/instant';
import type { Money } from '../shared/money';

/* Read models for the market strip and the activity tape. Both are read only
   and neither touches an aggregate, so they sit here beside the other query
   ports rather than behind a use case. Phase 3 reads the same shapes from the
   indexer projection.

   Nothing in this file knows what a lender is willing to pay; it reports what
   they have already offered. */

export interface CategoryIndexEntry {
  readonly category: ItemCategory;
  readonly liveListings: number;
  /* The mean of each live listing's best pending offer, which is what a
     borrower in this category would pay today. Null when nothing in the
     category has been offered on, which is different from a rate of zero. */
  readonly averageRateBasisPoints: number | null;
  /* The same mean computed over offers that already existed one window ago,
     so the strip can say which way the category has moved rather than only
     where it stands. Null when there is nothing to compare against. */
  readonly previousAverageRateBasisPoints: number | null;
}

export type TapeEventKind = 'OFFER_PLACED' | 'LOAN_ORIGINATED';

export interface TapeEvent {
  readonly at: Instant;
  readonly kind: TapeEventKind;
  readonly listingId: ListingId;
  /* The item, because the tape names what happened to a thing rather than to
     an identifier. */
  readonly itemDescription: string;
  readonly itemCategory: ItemCategory;
  readonly rateBasisPoints: number;
  readonly amount: Money;
}

export interface MarketQueries {
  categoryIndex(now: Instant, windowMs: bigint): Promise<readonly CategoryIndexEntry[]>;
  recentActivity(limit: number): Promise<readonly TapeEvent[]>;
}

export const MARKET_QUERIES = Symbol('MarketQueries');
