import { browseListings } from '@depawn/contracts';
import type { ListingSummary } from '@depawn/contracts';
import { Card, DataTable, Money, Rate, Skeleton } from '@depawn/ui';
import { useQuery } from '@tanstack/react-query';
import { Link, createFileRoute } from '@tanstack/react-router';
import type { ReactElement } from 'react';
import { MarketShell } from '../market-shell';
import { marketKeys } from '../market-keys';
import { useCurrentAccount } from '../current-account';
import { Navigate } from '@tanstack/react-router';

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

function BrowseCard(): ReactElement {
  const browseQuery = useQuery({ queryKey: marketKeys.browse, queryFn: () => browseListings() });

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
      <div data-testid="browse-table">
        <DataTable
          columns={[
            {
              key: 'listing',
              header: 'Listing',
              render: (listing: ListingSummary) => (
                <Link
                  to="/listings/$listingId"
                  params={{ listingId: listing.id }}
                  data-testid={`listing-${listing.id}`}
                  className="font-mono text-xs text-status-active"
                >
                  {listing.id}
                </Link>
              ),
            },
            {
              key: 'principal',
              header: 'Requested principal',
              render: (listing: ListingSummary) => <Money value={listing.requestedPrincipal} />,
            },
            {
              key: 'value',
              header: 'Appraised value',
              render: (listing: ListingSummary) => <Money value={listing.appraisedValue} />,
            },
            {
              key: 'maxRate',
              header: 'Maximum rate',
              render: (listing: ListingSummary) => (
                <Rate basisPoints={listing.maxAnnualPercentageRateBasisPoints} />
              ),
            },
            {
              key: 'category',
              header: 'Category',
              render: (listing: ListingSummary) => listing.itemCategory,
            },
          ]}
          rows={browseQuery.data.items}
          rowKey={(listing) => listing.id}
          emptyTitle="No live listings right now"
        />
      </div>
    </Card>
  );
}
