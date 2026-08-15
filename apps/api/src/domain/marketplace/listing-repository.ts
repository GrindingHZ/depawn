import type { AccountId, ListingId, ReceiptId } from '../shared/identifiers';
import type { UnitOfWorkContext } from '../ports/unit-of-work';
import type { Listing } from './listing';

export interface ListingRepository {
  findById(id: ListingId, context: UnitOfWorkContext): Promise<Listing | null>;
  findLiveByReceipt(receiptId: ReceiptId, context: UnitOfWorkContext): Promise<Listing | null>;
  listByBorrower(borrower: AccountId, context: UnitOfWorkContext): Promise<readonly Listing[]>;
  /* Serialises offer placement against acceptance; the Phase 3 equivalent is
     shared object consensus ordering on the Listing. */
  lock(id: ListingId, context: UnitOfWorkContext): Promise<void>;
  save(listing: Listing, context: UnitOfWorkContext): Promise<void>;
}

export const LISTING_REPOSITORY = Symbol('ListingRepository');
