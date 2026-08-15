import { ApiError, createListing, fetchMyReceipts, publishListing } from '@depawn/contracts';
import type { ReceiptResponse } from '@depawn/contracts';
import {
  Button,
  Card,
  DataTable,
  Dialog,
  Field,
  Money,
  Skeleton,
  StatusBadge,
  toMinorUnits,
} from '@depawn/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Navigate, createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import type { ReactElement } from 'react';
import { useCurrentAccount } from '../current-account';
import { marketKeys } from '../market-keys';
import { MarketShell } from '../market-shell';
import { receiptStatusTone } from '../receipt-status-tone';

export const Route = createFileRoute('/borrow/receipts')({
  component: BorrowReceiptsPage,
});

const receiptKeys = marketKeys;

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
    <MarketShell>
      <div className="max-w-3xl">
        <ReceiptsCard />
      </div>
    </MarketShell>
  );
}

function ReceiptsCard(): ReactElement {
  const receiptsQuery = useQuery({ queryKey: receiptKeys.myReceipts, queryFn: fetchMyReceipts });
  const [listingReceipt, setListingReceipt] = useState<ReceiptResponse | null>(null);

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
            {
              key: 'actions',
              header: '',
              render: (receipt: ReceiptResponse) =>
                receipt.status === 'IN_VAULT' ? (
                  <Button
                    variant="secondary"
                    data-testid={`list-${receipt.id}`}
                    onClick={() => setListingReceipt(receipt)}
                  >
                    List
                  </Button>
                ) : null,
            },
          ]}
          rows={receiptsQuery.data.items}
          rowKey={(receipt) => receipt.id}
          emptyTitle="No receipts yet"
        />
      </div>
      {listingReceipt === null ? null : (
        <ListReceiptDialog receipt={listingReceipt} onClose={() => setListingReceipt(null)} />
      )}
    </Card>
  );
}

function listMessageFor(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === 'LOAN_TO_VALUE_EXCEEDED') {
      return 'The requested principal is above the lending ceiling for this item.';
    }
    if (error.code === 'RECEIPT_ALREADY_LISTED') {
      return 'This receipt already has a live listing.';
    }
  }
  return 'The listing could not be created.';
}

function ListReceiptDialog({
  receipt,
  onClose,
}: {
  readonly receipt: ReceiptResponse;
  readonly onClose: () => void;
}): ReactElement {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [principalInput, setPrincipalInput] = useState('');
  const [maxRateInput, setMaxRateInput] = useState('24.00');
  const [durationDaysInput, setDurationDaysInput] = useState('30');
  const [inputError, setInputError] = useState<string | null>(null);

  const listMutation = useMutation({
    mutationFn: async (input: {
      minorUnits: string;
      maxRateBasisPoints: number;
      durationDays: number;
    }) => {
      const listing = await createListing(
        {
          receiptId: receipt.id,
          requestedPrincipal: { minorUnits: input.minorUnits, currency: 'AUD' },
          maxAnnualPercentageRateBasisPoints: input.maxRateBasisPoints,
          requestedDurationMs: input.durationDays * 24 * 60 * 60 * 1000,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        },
        { idempotencyKey: crypto.randomUUID() },
      );
      return publishListing(listing.id, { idempotencyKey: crypto.randomUUID() });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: marketKeys.myListings });
      await queryClient.invalidateQueries({ queryKey: marketKeys.browse });
      onClose();
      await navigate({ to: '/borrow/listings' });
    },
  });

  return (
    <Dialog title="List this receipt" isOpen onClose={onClose}>
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          const minorUnits = toMinorUnits(principalInput);
          const rate = toMinorUnits(maxRateInput);
          const durationDays = Number(durationDaysInput);
          if (minorUnits === null || rate === null || !Number.isInteger(durationDays)) {
            setInputError('Check the principal, rate, and duration.');
            return;
          }
          setInputError(null);
          listMutation.mutate({
            minorUnits,
            maxRateBasisPoints: Number(rate),
            durationDays,
          });
        }}
      >
        <Field
          label="Requested principal (AUD)"
          data-testid="list-principal"
          value={principalInput}
          onChange={(event) => setPrincipalInput(event.target.value)}
          errorMessage={inputError ?? undefined}
        />
        <Field
          label="Maximum rate (% per year)"
          data-testid="list-max-rate"
          value={maxRateInput}
          onChange={(event) => setMaxRateInput(event.target.value)}
        />
        <Field
          label="Duration (days)"
          data-testid="list-duration"
          value={durationDaysInput}
          onChange={(event) => setDurationDaysInput(event.target.value)}
        />
        <Button data-testid="list-submit" type="submit" disabled={listMutation.isPending}>
          List and publish
        </Button>
        {listMutation.isError ? (
          <p role="alert" className="font-body text-sm text-status-danger">
            {listMessageFor(listMutation.error)}
          </p>
        ) : null}
      </form>
    </Dialog>
  );
}
