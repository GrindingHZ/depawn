import { fetchMyReceipts } from '@depawn/contracts';
import type { ReceiptResponse } from '@depawn/contracts';
import { AppShell, Card, DataTable, Money, Skeleton, StatusBadge } from '@depawn/ui';
import { useQuery } from '@tanstack/react-query';
import { Link, Navigate, createFileRoute } from '@tanstack/react-router';
import type { ReactElement } from 'react';
import { useCurrentAccount } from '../current-account';
import { receiptStatusTone } from '../receipt-status-tone';

export const Route = createFileRoute('/borrow/receipts')({
  component: BorrowReceiptsPage,
});

const receiptKeys = {
  mine: ['receipts', 'mine'] as const,
};

function BorrowReceiptsPage(): ReactElement | null {
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
    <AppShell
      productName="depawn marketplace"
      navigation={
        <>
          <Link to="/" className="font-body text-sm text-ink-secondary">
            Home
          </Link>
          <Link to="/borrow/receipts" className="font-body text-sm text-ink-primary">
            My receipts
          </Link>
          <Link to="/wallet" className="font-body text-sm text-ink-secondary">
            Wallet
          </Link>
        </>
      }
    >
      <div className="max-w-3xl">
        <ReceiptsCard />
      </div>
    </AppShell>
  );
}

function ReceiptsCard(): ReactElement {
  const receiptsQuery = useQuery({ queryKey: receiptKeys.mine, queryFn: fetchMyReceipts });

  if (receiptsQuery.isPending) {
    return (
      <Card title="My receipts">
        <Skeleton lineCount={4} />
      </Card>
    );
  }
  if (receiptsQuery.isError || receiptsQuery.data === undefined) {
    return (
      <Card title="My receipts">
        <p role="alert" className="font-body text-sm text-status-danger">
          Your receipts could not be loaded.
        </p>
      </Card>
    );
  }

  return (
    <Card title="My receipts">
      <div data-testid="my-receipts">
        <DataTable
          columns={[
            {
              key: 'id',
              header: 'Receipt',
              render: (receipt: ReceiptResponse) => (
                <span data-testid={`receipt-${receipt.id}`} className="font-mono text-xs">
                  {receipt.id}
                </span>
              ),
            },
            {
              key: 'value',
              header: 'Appraised value',
              render: (receipt: ReceiptResponse) => <Money value={receipt.appraisedValue} />,
            },
            {
              key: 'category',
              header: 'Category',
              render: (receipt: ReceiptResponse) => receipt.itemCategory,
            },
            {
              key: 'status',
              header: 'Status',
              render: (receipt: ReceiptResponse) => (
                <StatusBadge tone={receiptStatusTone(receipt.status)} label={receipt.status} />
              ),
            },
          ]}
          rows={receiptsQuery.data.items}
          rowKey={(receipt) => receipt.id}
          emptyTitle="No receipts yet"
        />
      </div>
    </Card>
  );
}
