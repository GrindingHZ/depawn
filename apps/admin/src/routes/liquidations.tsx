import { ApiError, closeLiquidation, fetchLiquidations, openLiquidation } from '@depawn/contracts';
import type { LiquidationResponse } from '@depawn/contracts';
import { AppShell, Button, Card, DataTable, Money, Skeleton, StatusBadge } from '@depawn/ui';
import type { StatusTone } from '@depawn/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, Navigate, createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import type { ReactElement } from 'react';
import { useCurrentAccount } from '../current-account';

export const Route = createFileRoute('/liquidations')({
  component: LiquidationsPage,
});

const liquidationKeys = {
  all: ['liquidations'] as const,
};

const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

/* Sale state to tone: a sale taking bids is live, a settled one is done, and
   a cancelled one is neither. */
function liquidationTone(status: LiquidationResponse['status']): StatusTone {
  switch (status) {
    case 'SCHEDULED':
      return 'warning';
    case 'BIDDING':
      return 'active';
    case 'SETTLED':
      return 'success';
    case 'CANCELLED':
      return 'neutral';
  }
}

function actionMessageFor(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === 'LIQUIDATION_NOT_SCHEDULED') {
      return 'This sale is no longer waiting to open.';
    }
    if (error.code === 'LIQUIDATION_NOT_OPEN') {
      return 'This sale cannot be closed: it is not taking bids, or nobody has bid.';
    }
  }
  return 'The step could not be recorded.';
}

function LiquidationsPage(): ReactElement | null {
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
  if (!currentAccount.data.roles.includes('OPERATIONS')) {
    return (
      <main className="p-6">
        <p data-testid="access-denied" className="font-body text-sm text-ink-primary">
          Liquidations require the operations role.
        </p>
      </main>
    );
  }

  return (
    <AppShell
      productName="depawn admin"
      navigation={
        <>
          <Link to="/" className="font-body text-sm text-ink-secondary">
            Home
          </Link>
          <Link to="/operations" className="font-body text-sm text-ink-secondary">
            Operations
          </Link>
          <Link to="/deposits" className="font-body text-sm text-ink-secondary">
            Deposits
          </Link>
          <Link to="/liquidations" className="font-body text-sm text-ink-primary">
            Liquidations
          </Link>
        </>
      }
    >
      <div className="max-w-5xl">
        <LiquidationsCard />
      </div>
    </AppShell>
  );
}

function LiquidationsCard(): ReactElement {
  const queryClient = useQueryClient();
  const [actionError, setActionError] = useState<string | null>(null);
  const [openKey, setOpenKey] = useState(() => crypto.randomUUID());
  const [closeKey, setCloseKey] = useState(() => crypto.randomUUID());
  const liquidationsQuery = useQuery({
    queryKey: liquidationKeys.all,
    queryFn: () => fetchLiquidations(),
  });

  const openMutation = useMutation({
    mutationFn: (liquidationId: string) =>
      openLiquidation(liquidationId, { biddingWindowMs: sevenDaysMs }, { idempotencyKey: openKey }),
    onSuccess: async () => {
      setOpenKey(crypto.randomUUID());
      setActionError(null);
      await queryClient.invalidateQueries({ queryKey: liquidationKeys.all });
    },
    onError: (error) => setActionError(actionMessageFor(error)),
  });

  const closeMutation = useMutation({
    mutationFn: (liquidationId: string) =>
      closeLiquidation(liquidationId, { idempotencyKey: closeKey }),
    onSuccess: async () => {
      setCloseKey(crypto.randomUUID());
      setActionError(null);
      await queryClient.invalidateQueries({ queryKey: liquidationKeys.all });
    },
    onError: (error) => setActionError(actionMessageFor(error)),
  });

  if (liquidationsQuery.isPending) {
    return (
      <Card title="Liquidations">
        <Skeleton lineCount={4} />
      </Card>
    );
  }
  if (liquidationsQuery.isError || liquidationsQuery.data === undefined) {
    return (
      <Card title="Liquidations">
        <p role="alert" className="font-body text-sm text-status-danger">
          The liquidations could not be loaded.
        </p>
      </Card>
    );
  }

  return (
    <Card title="Liquidations">
      {actionError === null ? null : (
        <p role="alert" className="mb-3 font-body text-sm text-status-danger">
          {actionError}
        </p>
      )}
      <div data-testid="liquidations-table">
        <DataTable
          columns={[
            {
              key: 'loan',
              header: 'Loan',
              render: (item: LiquidationResponse) => (
                <span className="font-mono text-xs">{item.loanId}</span>
              ),
            },
            {
              key: 'reserve',
              header: 'Reserve',
              render: (item: LiquidationResponse) => <Money value={item.reservePrice} />,
            },
            {
              key: 'highest',
              header: 'Highest bid',
              render: (item: LiquidationResponse) =>
                item.highestBid === null ? (
                  <span className="font-body text-sm text-ink-secondary">No bids</span>
                ) : (
                  <Money value={item.highestBid} />
                ),
            },
            {
              key: 'status',
              header: 'Status',
              render: (item: LiquidationResponse) => (
                <StatusBadge tone={liquidationTone(item.status)} label={item.status} />
              ),
            },
            {
              key: 'actions',
              header: '',
              render: (item: LiquidationResponse) => (
                <span className="flex gap-2">
                  {item.status === 'SCHEDULED' ? (
                    <Button
                      data-testid={`open-${item.id}`}
                      onClick={() => openMutation.mutate(item.id)}
                      disabled={openMutation.isPending}
                    >
                      Open bidding
                    </Button>
                  ) : null}
                  {item.status === 'BIDDING' && item.highestBid !== null ? (
                    <Button
                      variant="secondary"
                      data-testid={`close-${item.id}`}
                      onClick={() => closeMutation.mutate(item.id)}
                      disabled={closeMutation.isPending}
                    >
                      Close and settle
                    </Button>
                  ) : null}
                </span>
              ),
            },
          ]}
          rows={liquidationsQuery.data.items}
          rowKey={(item) => item.id}
          emptyTitle="No liquidations scheduled"
        />
      </div>
      <p className="mt-3 font-body text-sm text-ink-secondary">
        Closing a sale pays the lender first, then the platform fee, then returns any surplus to the
        borrower. It cannot be undone.
      </p>
    </Card>
  );
}
