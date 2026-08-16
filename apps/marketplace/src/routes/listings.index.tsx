import { browseListings, itemCategories, nameForCategory } from '@depawn/contracts';
import type { ListingSummary } from '@depawn/contracts';
import {
  Card,
  EmptyState,
  Explain,
  ItemPhotograph,
  LoanToValue,
  Money,
  Rate,
  Select,
  Skeleton,
} from '@depawn/ui';
import { useQuery } from '@tanstack/react-query';
import { Link, Navigate, createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import type { ReactElement } from 'react';
import { MarketShell } from '../market-shell';
import { marketKeys } from '../market-keys';
import { useCurrentAccount } from '../current-account';

export const Route = createFileRoute('/listings/')({
  component: BrowsePage,
});

function BrowsePage(): ReactElement | null {
  const currentAccount = useCurrentAccount();
  if (currentAccount.isPending) {
    return (
      <main className="p-6">
        <Skeleton lineCount={4} />
      </main>
    );
  }
  if (currentAccount.data === null || currentAccount.data === undefined) {
    return <Navigate to="/login" />;
  }

  return (
    <MarketShell>
      <div className="max-w-4xl">
        <BrowseCard />
      </div>
    </MarketShell>
  );
}

/* The filters go to the api rather than being applied to a page already
   fetched. Filtering what happens to have loaded would hide rows from the
   reader while telling them they have seen everything. */
function BrowseCard(): ReactElement {
  const [category, setCategory] = useState('');
  const [maxLoanToValue, setMaxLoanToValue] = useState('');
  const [sort, setSort] = useState<'newest' | 'rate' | 'closing'>('newest');

  const browseQuery = useQuery({
    queryKey: marketKeys.browseWith(category, maxLoanToValue, sort),
    queryFn: () =>
      browseListings({
        ...(category === '' ? {} : { category }),
        ...(maxLoanToValue === '' ? {} : { maxLoanToValueBasisPoints: Number(maxLoanToValue) }),
        sort,
      }),
  });

  if (browseQuery.isPending) {
    return (
      <Card title="Live listings">
        <Skeleton lineCount={4} />
      </Card>
    );
  }
  if (browseQuery.isError || browseQuery.data === undefined) {
    return (
      <Card title="Live listings">
        <p role="alert" className="font-body text-sm text-status-danger">
          The listings could not be loaded.
        </p>
      </Card>
    );
  }

  return (
    <Card title="Live listings">
      <BrowseControls
        category={category}
        onCategory={setCategory}
        maxLoanToValue={maxLoanToValue}
        onMaxLoanToValue={setMaxLoanToValue}
        sort={sort}
        onSort={setSort}
      />
      <div data-testid="browse-table" className="mt-4 flex flex-col gap-3">
        {browseQuery.data.items.length === 0 ? (
          <EmptyState
            title="No live listings right now"
            description="Borrowers list items after the vault has taken custody of them."
          />
        ) : (
          browseQuery.data.items.map((listing) => <ListingRow key={listing.id} listing={listing} />)
        )}
      </div>
    </Card>
  );
}

/* A row is a lending opportunity, not a database record. The item leads,
   because it is what the money is secured against; the ask is the one figure
   set larger, because it is what the lender is deciding about; and the loan
   to value sits beside it, because otherwise every reader does that division
   in their head. The listing id is still here and still linkable, just no
   longer the loudest thing on the screen. */
function ListingRow({ listing }: { readonly listing: ListingSummary }): ReactElement {
  return (
    <div
      className={[
        'flex items-center gap-4 rounded-lg border border-edge bg-surface-raised p-4',
        'transition-colors duration-control ease-enter',
        'focus-within:border-ink-secondary hover:border-ink-secondary hover:shadow-raised',
      ].join(' ')}
    >
      <ItemPhotograph
        src={listing.hasPhotograph ? `/api/v1/receipts/${listing.receiptId}/photo` : null}
        alt={listing.itemDescription}
        testId={`photo-${listing.id}`}
      />

      <div className="min-w-0 flex-1">
        {/* The link is the item name rather than the whole row, because the
            row carries its own controls, and interactive content cannot nest
            inside a link without breaking both the keyboard and the markup. */}
        <Link
          to="/listings/$listingId"
          params={{ listingId: listing.id }}
          data-testid={`listing-${listing.id}`}
          className={[
            'block truncate font-body text-sm font-semibold text-ink-primary',
            'hover:text-accent focus-visible:outline focus-visible:outline-2',
            'focus-visible:outline-offset-2 focus-visible:outline-status-active',
          ].join(' ')}
        >
          {listing.itemDescription}
        </Link>
        <p className="mt-0.5 font-body text-xs text-ink-secondary">
          {nameForCategory(listing.itemCategory)} &middot; appraised at{' '}
          <Money value={listing.appraisedValue} /> &middot; up to{' '}
          <Rate basisPoints={listing.maxAnnualPercentageRateBasisPoints} />
        </p>
      </div>

      <div className="shrink-0 text-right">
        <p className="font-mono text-base font-semibold tabular-nums text-ink-primary">
          <Money value={listing.requestedPrincipal} />
        </p>
        <span className="mt-1 inline-flex items-center">
          <LoanToValue basisPoints={listing.loanToValueBasisPoints} testId={`ltv-${listing.id}`} />
          <Explain termId="loanToValue" audience="lender" />
        </span>
      </div>
    </div>
  );
}

interface BrowseControlsProps {
  readonly category: string;
  readonly onCategory: (value: string) => void;
  readonly maxLoanToValue: string;
  readonly onMaxLoanToValue: (value: string) => void;
  readonly sort: 'newest' | 'rate' | 'closing';
  readonly onSort: (value: 'newest' | 'rate' | 'closing') => void;
}

function BrowseControls({
  category,
  onCategory,
  maxLoanToValue,
  onMaxLoanToValue,
  sort,
  onSort,
}: BrowseControlsProps): ReactElement {
  return (
    <div data-testid="browse-controls" className="flex flex-wrap items-end gap-4">
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
        onChange={(event) => onSort(event.target.value as 'newest' | 'rate' | 'closing')}
      >
        <option value="newest">Newest first</option>
        <option value="rate">Lowest rate ceiling</option>
        <option value="closing">Closing soonest</option>
      </Select>
    </div>
  );
}
