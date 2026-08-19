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
  /* The cheapest pending offer, which is what the borrower would pay if they
     accepted now. Null means nobody has offered, which the rail has to be
     able to say without guessing: a row that reports no offers because
     nothing was fetched is telling the reader something untrue. */
  readonly bestOfferRateBasisPoints: number | null;
}

export interface ListingsPage {
  readonly items: readonly ListingSummaryReadModel[];
  readonly nextCursor: string | null;
}

/* Newest is the default and pages on the id alone. The other two order by a
   value that repeats across listings, so their cursor has to carry that value
   as well as the id or a page boundary would skip or repeat rows. */
export type BrowseSort = 'newest' | 'rate' | 'closing';

export interface BrowseFilter {
  readonly cursor: string | null;
  readonly limit: number;
  readonly now: Instant;
  readonly category: ItemCategory | null;
  /* Show only listings asking for this share of the appraisal or less, so a
     lender can say what risk they are willing to look at rather than reading
     past what they are not. */
  readonly maximumLoanToValueBasisPoints: number | null;
  readonly sort: BrowseSort;
}

export interface MarketplaceQueries {
  browseActive(filter: BrowseFilter): Promise<ListingsPage>;
  /* Whether a servable photograph exists for the item behind a receipt. The
     bytes are behind their own authorisation; this only says whether asking
     is worthwhile, so a screen can reserve the space or not. */
  photographExists(receiptId: ReceiptId): Promise<boolean>;
  offersByLender(lender: AccountId): Promise<readonly Offer[]>;
}

export const MARKETPLACE_QUERIES = Symbol('MarketplaceQueries');
