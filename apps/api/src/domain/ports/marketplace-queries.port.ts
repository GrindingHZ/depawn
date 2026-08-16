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
  readonly itemDescription: string;
  readonly hasPhotograph: boolean;
}

export interface ListingsPage {
  readonly items: readonly ListingSummaryReadModel[];
  readonly nextCursor: string | null;
}

export interface MarketplaceQueries {
  browseActive(cursor: string | null, limit: number, now: Instant): Promise<ListingsPage>;
  /* Whether a servable photograph exists for the item behind a receipt. The
     bytes are behind their own authorisation; this only says whether asking
     is worthwhile, so a screen can reserve the space or not. */
  photographExists(receiptId: ReceiptId): Promise<boolean>;
  offersByLender(lender: AccountId): Promise<readonly Offer[]>;
}

export const MARKETPLACE_QUERIES = Symbol('MarketplaceQueries');
