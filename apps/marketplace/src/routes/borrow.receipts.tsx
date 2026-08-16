import {
  ApiError,
  createListing,
  fetchMyReceipts,
  fetchMyRedemptionRequests,
  messageForError,
  nameForCategory,
  nameForRedemptionStatus,
  nameForReceiptStatus,
  publishListing,
  requestRedemption,
} from '@depawn/contracts';
import type { ReceiptResponse, RedemptionRequestResponse } from '@depawn/contracts';
import {
  Button,
  Card,
  DataTable,
  Dialog,
  Explain,
  Field,
  ItemPhotograph,
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
      <div className="max-w-5xl">
        <ReceiptsCard />
      </div>
    </MarketShell>
  );
}

function redemptionMessageFor(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === 'RECEIPT_ENCUMBERED') {
      return 'Repay the loan before asking for the item back.';
    }
    if (error.code === 'RECEIPT_ALREADY_BURNED') {
      return 'This item has already been requested.';
    }
  }
  return messageForError(error, 'The request could not be made.');
}

function ReceiptsCard(): ReactElement {
  const queryClient = useQueryClient();
  const receiptsQuery = useQuery({ queryKey: receiptKeys.myReceipts, queryFn: fetchMyReceipts });
  const redemptionsQuery = useQuery({
    queryKey: receiptKeys.myRedemptions,
    queryFn: fetchMyRedemptionRequests,
  });
  const [listingReceipt, setListingReceipt] = useState<ReceiptResponse | null>(null);
  const [redemptionError, setRedemptionError] = useState<string | null>(null);
  // Generated on mount and rotated per success (docs/05-frontend.md).
  const [redemptionKey, setRedemptionKey] = useState(() => crypto.randomUUID());

  const redemptionMutation = useMutation({
    mutationFn: (receiptId: string) =>
      requestRedemption(receiptId, { idempotencyKey: redemptionKey }),
    onSuccess: async () => {
      setRedemptionKey(crypto.randomUUID());
      setRedemptionError(null);
      await queryClient.invalidateQueries({ queryKey: receiptKeys.myReceipts });
      await queryClient.invalidateQueries({ queryKey: receiptKeys.myRedemptions });
    },
    onError: (error) => setRedemptionError(redemptionMessageFor(error)),
  });

  const redemptionByReceipt = new Map<string, RedemptionRequestResponse>(
    (redemptionsQuery.data?.items ?? []).map((item) => [item.receiptId, item]),
  );

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
      {redemptionError === null ? null : (
        <p role="alert" className="mb-3 font-body text-sm text-status-danger">
          {redemptionError}
        </p>
      )}
      <div data-testid="my-receipts">
        <DataTable
          columns={[
            /* The item leads, because this is the reader's own property and
               the receipt id is only how our systems refer to it. The id is
               still here, under the name, for anyone quoting it to staff. */
            {
              key: 'item',
              header: 'Item',
              render: (receipt: ReceiptResponse) => (
                <span className="flex items-center gap-3">
                  <ItemPhotograph
                    src={receipt.hasPhotograph ? `/api/v1/receipts/${receipt.id}/photo` : null}
                    alt={receipt.itemDescription}
                    testId={`photo-${receipt.id}`}
                  />
                  <span className="min-w-0">
                    <span className="block font-body text-sm font-semibold text-ink-primary">
                      {receipt.itemDescription}
                    </span>
                    <span className="block font-body text-xs text-ink-secondary">
                      {nameForCategory(receipt.itemCategory)}
                    </span>
                    <span
                      data-testid={`receipt-${receipt.id}`}
                      className="mt-0.5 block font-mono text-[11px] text-ink-secondary"
                    >
                      {receipt.id}
                    </span>
                  </span>
                </span>
              ),
            },
            {
              key: 'value',
              header: (
                <span className="inline-flex items-center">
                  Appraised value
                  <Explain termId="appraisedValue" audience="borrower" />
                </span>
              ),
              render: (receipt: ReceiptResponse) => (
                <span className="font-mono tabular-nums">
                  <Money value={receipt.appraisedValue} />
                </span>
              ),
            },
            {
              key: 'status',
              header: 'Status',
              render: (receipt: ReceiptResponse) => (
                <StatusBadge
                  tone={receiptStatusTone(receipt.status)}
                  label={nameForReceiptStatus(receipt.status)}
                />
              ),
            },
            {
              key: 'redemption',
              header: 'Redemption',
              render: (receipt: ReceiptResponse) => {
                const redemption = redemptionByReceipt.get(receipt.id);
                return redemption === undefined ? (
                  <span className="font-body text-sm text-ink-secondary">Not requested</span>
                ) : (
                  <span data-testid={`redemption-${receipt.id}`}>
                    <StatusBadge
                      tone={redemption.status === 'RELEASED' ? 'success' : 'active'}
                      label={nameForRedemptionStatus(redemption.status)}
                    />
                  </span>
                );
              },
            },
            {
              key: 'actions',
              header: '',
              render: (receipt: ReceiptResponse) =>
                receipt.status === 'IN_VAULT' ? (
                  <span className="flex gap-2">
                    <Button
                      variant="secondary"
                      data-testid={`list-${receipt.id}`}
                      onClick={() => setListingReceipt(receipt)}
                    >
                      List
                    </Button>
                    <Button
                      variant="secondary"
                      className="whitespace-nowrap"
                      data-testid={`redeem-${receipt.id}`}
                      onClick={() => redemptionMutation.mutate(receipt.id)}
                      disabled={redemptionMutation.isPending}
                    >
                      Ask for it back
                    </Button>
                  </span>
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
  return messageForError(error, 'The listing could not be created.');
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
  // Both steps carry keys generated when the dialog mounts, so a double
  // click or a retry after a network blip replays instead of duplicating
  // (docs/05-frontend.md).
  const [createKey] = useState(() => crypto.randomUUID());
  const [publishKey] = useState(() => crypto.randomUUID());

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
        { idempotencyKey: createKey },
      );
      return publishListing(listing.id, { idempotencyKey: publishKey });
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
