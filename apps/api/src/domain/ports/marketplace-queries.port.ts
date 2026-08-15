import type { ItemCategory } from '../custody/item-category';
import type { ListingStatus } from '../marketplace/listing';
import type { Offer } from '../marketplace/offer';
import type { AccountId, ListingId, ReceiptId } from '../shared/identifiers';
import type { Instant } from '../shared/instant';
import type { Money } from '../shared/money';

/* Read models for the marketplace screens; the Prisma implementation lives
   in infrastructure, and Phase 3 reads the same shapes from the indexer
   projection. */
export interface ListingSummaryReadModel {
  readonly id: ListingId;
  readonly borrowerAccountId: AccountId;
  readonly receiptId: ReceiptId;
  readonly requestedPrincipal: Money;
  readonly maxAnnualPercentageRateBasisPoints: number;
  readonly requestedDurationMs: bigint;
  readonly expiresAt: Instant;
  readonly status: ListingStatus;
  readonly appraisedValue: Money;
  readonly itemCategory: ItemCategory;
}

export interface ListingsPage {
  readonly items: readonly ListingSummaryReadModel[];
  readonly nextCursor: string | null;
}

export interface MarketplaceQueries {
  browseActive(cursor: string | null, limit: number, now: Instant): Promise<ListingsPage>;
  offersByLender(lender: AccountId): Promise<readonly Offer[]>;
}

export const MARKETPLACE_QUERIES = Symbol('MarketplaceQueries');
