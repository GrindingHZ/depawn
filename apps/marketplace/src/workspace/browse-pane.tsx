import { itemCategories, nameForCategory } from '@depawn/contracts';
import type { ListingSummary } from '@depawn/contracts';
import { CollateralCard, CollateralRow, EmptyState, Select, Skeleton } from '@depawn/ui';
import type { CollateralItem, CollateralRelationship } from '@depawn/ui';
import type { ReactElement } from 'react';

export type BrowseDensity = 'rows' | 'gallery';
export type BrowseSort = 'newest' | 'rate' | 'closing';

export interface BrowsePaneProps {
  readonly listings: readonly ListingSummary[];
  readonly isPending: boolean;
  readonly isError: boolean;
  readonly selectedListingId: string | null;
  readonly onSelect: (listingId: string) => void;
  readonly relationshipFor: (listing: ListingSummary) => CollateralRelationship;
  readonly bestRateFor: (listing: ListingSummary) => number | null;
  readonly nowEpochMs: number;
  readonly category: string;
  readonly onCategory: (value: string) => void;
  readonly maxLoanToValue: string;
  readonly onMaxLoanToValue: (value: string) => void;
  readonly sort: BrowseSort;
  readonly onSort: (value: BrowseSort) => void;
  readonly density: BrowseDensity;
  readonly onDensity: (value: BrowseDensity) => void;
}

/* Whole units only, and the largest that still says something true. A
   countdown to the second on a listing closing tomorrow is noise. */
export function closesIn(expiresAt: string, nowEpochMs: number): string {
  const remaining = Date.parse(expiresAt) - nowEpochMs;
  if (!Number.isFinite(remaining) || remaining <= 0) {
    return 'closed';
  }
  const minutes = Math.floor(remaining / 60_000);
  if (minutes < 60) {
    return `closes in ${String(minutes)}m`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `closes in ${String(hours)}h ${String(minutes % 60)}m`;
  }
  return `closes in ${String(Math.floor(hours / 24))}d ${String(hours % 24)}h`;
}

function itemFrom(
  listing: ListingSummary,
  relationship: CollateralRelationship,
  bestRate: number | null,
  nowEpochMs: number,
): CollateralItem {
  return {
    listingId: listing.id,
    itemDescription: listing.itemDescription,
    itemCategory: listing.itemCategory,
    categoryName: nameForCategory(listing.itemCategory),
    appraisedValue: listing.appraisedValue,
    requestedPrincipal: listing.requestedPrincipal,
    loanToValueBasisPoints: listing.loanToValueBasisPoints,
    bestRateBasisPoints: bestRate,
    closesIn: closesIn(listing.expiresAt, nowEpochMs),
    photographSrc: listing.hasPhotograph ? `/api/v1/receipts/${listing.receiptId}/photo` : null,
    relationship,
  };
}

/* The left pane. Filtering and sorting go to the api rather than being
   applied to a page already fetched: filtering what happens to have loaded
   hides rows from the reader while telling them they have seen everything. */
export function BrowsePane(props: BrowsePaneProps): ReactElement {
  const { listings, isPending, isError, density } = props;

  return (
    <div className="flex min-h-0 flex-col">
      <BrowseControls {...props} />
      {isPending ? (
        <div className="p-3">
          <Skeleton lineCount={5} />
        </div>
      ) : isError ? (
        <p role="alert" className="p-3 font-body text-sm text-status-danger">
          The listings could not be loaded.
        </p>
      ) : listings.length === 0 ? (
        <div className="p-3">
          <EmptyState
            title="No live listings right now"
            description="Borrowers list items after the vault has taken custody of them."
          />
        </div>
      ) : (
        <div
          data-testid="browse-table"
          className={
            density === 'gallery' ? 'grid grid-cols-2 gap-2 p-2 xl:grid-cols-3' : 'flex flex-col'
          }
        >
          {listings.map((listing) => {
            const item = itemFrom(
              listing,
              props.relationshipFor(listing),
              props.bestRateFor(listing),
              props.nowEpochMs,
            );
            const isSelected = props.selectedListingId === listing.id;
            return density === 'gallery' ? (
              <span key={listing.id} data-testid={`listing-${listing.id}`}>
                <CollateralCard item={item} isSelected={isSelected} onSelect={props.onSelect} />
              </span>
            ) : (
              <span key={listing.id} data-testid={`listing-${listing.id}`}>
                <CollateralRow item={item} isSelected={isSelected} onSelect={props.onSelect} />
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}

function BrowseControls({
  category,
  onCategory,
  maxLoanToValue,
  onMaxLoanToValue,
  sort,
  onSort,
  density,
  onDensity,
}: BrowsePaneProps): ReactElement {
  return (
    <div
      data-testid="browse-controls"
      className="flex flex-wrap items-end gap-3 border-b border-edge p-3"
    >
      <Select
        label="Category"
        data-testid="filter-category"
        value={category}
        onChange={(event) => onCategory(event.target.value)}
      >
        <option value="">Anything</option>
        {itemCategories.map((value) => (
          <option key={value} value={value}>
            {nameForCategory(value)}
          </option>
        ))}
      </Select>
      <Select
        label="Loan to value at most"
        data-testid="filter-ltv"
        value={maxLoanToValue}
        onChange={(event) => onMaxLoanToValue(event.target.value)}
      >
        <option value="">Any</option>
        <option value="3000">30% or less</option>
        <option value="5000">50% or less</option>
      </Select>
      <Select
        label="Sort by"
        data-testid="sort-listings"
        value={sort}
        onChange={(event) => onSort(event.target.value as BrowseSort)}
      >
        <option value="newest">Newest first</option>
        <option value="rate">Lowest rate ceiling</option>
        <option value="closing">Closing soonest</option>
      </Select>
      {/* Rows to compare with, a gallery to hunt in. */}
      <Select
        label="Show as"
        data-testid="browse-density"
        value={density}
        onChange={(event) => onDensity(event.target.value as BrowseDensity)}
      >
        <option value="rows">Rows</option>
        <option value="gallery">Gallery</option>
      </Select>
    </div>
  );
}
