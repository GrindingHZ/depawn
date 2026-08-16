import { ApiError, cancelListing, fetchMyListings, messageForError } from '@depawn/contracts';
import type { ListingResponse } from '@depawn/contracts';
import { Button, Card, DataTable, Explain, Money, Rate, Skeleton, StatusBadge } from '@depawn/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, Navigate, createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import type { ReactElement } from 'react';
import { useCurrentAccount } from '../current-account';
import { listingStatusTone } from '../listing-status-tone';
import { marketKeys } from '../market-keys';
import { MarketShell } from '../market-shell';

export const Route = createFileRoute('/borrow/listings')({
  component: BorrowListingsPage,
});

function BorrowListingsPage(): ReactElement | null {
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
        <MyListingsCard />
      </div>
    </MarketShell>
  );
}

function cancelMessageFor(error: unknown): string {
  if (error instanceof ApiError && error.code === 'LISTING_NOT_ACTIVE') {
    return 'The listing can no longer be cancelled.';
  }
  return messageForError(error, 'The listing could not be cancelled.');
}

function MyListingsCard(): ReactElement {
  const queryClient = useQueryClient();
  const listingsQuery = useQuery({ queryKey: marketKeys.myListings, queryFn: fetchMyListings });
  const [cancelError, setCancelError] = useState<string | null>(null);
  // Generated on mount and rotated per success (docs/05-frontend.md).
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());

  const cancelMutation = useMutation({
    mutationFn: (listingId: string) => cancelListing(listingId, { idempotencyKey }),
    onSuccess: async () => {
      setIdempotencyKey(crypto.randomUUID());
      setCancelError(null);
      await queryClient.invalidateQueries({ queryKey: marketKeys.myListings });
      await queryClient.invalidateQueries({ queryKey: marketKeys.browse });
    },
    onError: (error) => setCancelError(cancelMessageFor(error)),
  });

  if (listingsQuery.isPending) {
    return (
      <Card title="My listings">
        <Skeleton lineCount={4} />
      </Card>
    );
  }
  if (listingsQuery.isError || listingsQuery.data === undefined) {
    return (
      <Card title="My listings">
        <p role="alert" className="font-body text-sm text-status-danger">
          Your listings could not be loaded.
        </p>
      </Card>
    );
  }

  return (
    <Card title="My listings">
      {cancelError === null ? null : (
        <p role="alert" className="mb-3 font-body text-sm text-status-danger">
          {cancelError}
        </p>
      )}
      <div data-testid="my-listings">
        <DataTable
          columns={[
            {
              key: 'listing',
              header: 'Listing',
              render: (listing: ListingResponse) => (
                <Link
                  to="/listings/$listingId"
                  params={{ listingId: listing.id }}
                  className="font-mono text-xs text-status-active"
                >
                  {listing.id}
                </Link>
              ),
            },
            {
              key: 'principal',
              header: 'Requested principal',
              render: (listing: ListingResponse) => <Money value={listing.requestedPrincipal} />,
            },
            {
              key: 'ceiling',
              header: (
                <span className="inline-flex items-center">
                  Rate ceiling
                  <Explain termId="lendingCeiling" audience="borrower" />
                </span>
              ),
              render: (listing: ListingResponse) => (
                <Rate basisPoints={listing.maxAnnualPercentageRateBasisPoints} />
              ),
            },
            {
              key: 'status',
              header: 'Status',
              render: (listing: ListingResponse) => (
                <StatusBadge tone={listingStatusTone(listing.status)} label={listing.status} />
              ),
            },
            {
              key: 'actions',
              header: '',
              render: (listing: ListingResponse) =>
                listing.status === 'ACTIVE' || listing.status === 'DRAFT' ? (
                  <Button
                    variant="secondary"
                    data-testid={`cancel-${listing.id}`}
                    onClick={() => cancelMutation.mutate(listing.id)}
                    disabled={cancelMutation.isPending}
                  >
                    Cancel
                  </Button>
                ) : null,
            },
          ]}
          rows={listingsQuery.data.items}
          rowKey={(listing) => listing.id}
          emptyTitle="You have not listed anything yet"
        />
      </div>
    </Card>
  );
}
