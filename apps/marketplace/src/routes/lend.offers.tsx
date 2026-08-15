import { fetchMyOffers, reclaimOffer } from '@depawn/contracts';
import type { OfferResponse } from '@depawn/contracts';
import { Button, Card, DataTable, Money, Rate, Skeleton, StatusBadge } from '@depawn/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Navigate, createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import type { ReactElement } from 'react';
import { useCurrentAccount } from '../current-account';
import { offerStatusTone } from '../listing-status-tone';
import { marketKeys } from '../market-keys';
import { MarketShell } from '../market-shell';
import { walletKeys } from '../wallet-keys';

export const Route = createFileRoute('/lend/offers')({
  component: LendOffersPage,
});

function LendOffersPage(): ReactElement | null {
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
        <MyOffersCard />
      </div>
    </MarketShell>
  );
}

function MyOffersCard(): ReactElement {
  const queryClient = useQueryClient();
  const offersQuery = useQuery({ queryKey: marketKeys.myOffers, queryFn: fetchMyOffers });
  // Generated on mount and rotated per success, so a double click replays and
  // the next reclaim gets a fresh key (docs/05-frontend.md).
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());

  const reclaimMutation = useMutation({
    mutationFn: (offerId: string) => reclaimOffer(offerId, { idempotencyKey }),
    onSuccess: async () => {
      setIdempotencyKey(crypto.randomUUID());
      await queryClient.invalidateQueries({ queryKey: marketKeys.myOffers });
      await queryClient.invalidateQueries({ queryKey: walletKeys.all });
    },
  });

  if (offersQuery.isPending) {
    return (
      <Card title="My offers">
        <Skeleton lineCount={4} />
      </Card>
    );
  }
  if (offersQuery.isError || offersQuery.data === undefined) {
    return (
      <Card title="My offers">
        <p role="alert" className="font-body text-sm text-status-danger">
          Your offers could not be loaded.
        </p>
      </Card>
    );
  }

  return (
    <Card title="My offers">
      {reclaimMutation.isError ? (
        <p role="alert" className="mb-3 font-body text-sm text-status-danger">
          The hold could not be reclaimed.
        </p>
      ) : null}
      <div data-testid="my-offers">
        <DataTable
          columns={[
            {
              key: 'principal',
              header: 'Principal',
              render: (offer: OfferResponse) => <Money value={offer.principal} />,
            },
            {
              key: 'rate',
              header: 'Rate',
              render: (offer: OfferResponse) => (
                <Rate basisPoints={offer.annualPercentageRateBasisPoints} />
              ),
            },
            {
              key: 'status',
              header: 'Status',
              render: (offer: OfferResponse) => (
                <StatusBadge tone={offerStatusTone(offer.status)} label={offer.status} />
              ),
            },
            {
              key: 'actions',
              header: '',
              render: (offer: OfferResponse) =>
                offer.status === 'SUPERSEDED' || offer.status === 'EXPIRED' ? (
                  <Button
                    variant="secondary"
                    data-testid={`reclaim-${offer.id}`}
                    onClick={() => reclaimMutation.mutate(offer.id)}
                    disabled={reclaimMutation.isPending}
                  >
                    Reclaim funds
                  </Button>
                ) : null,
            },
          ]}
          rows={offersQuery.data.items}
          rowKey={(offer) => offer.id}
          emptyTitle="You have not made any offers yet"
        />
      </div>
    </Card>
  );
}
