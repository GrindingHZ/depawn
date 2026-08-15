import { ApiError, acceptOffer, fetchListing, placeOffer } from '@depawn/contracts';
import type { ListingDetailResponse, RankedOfferResponse } from '@depawn/contracts';
import { Button, Card, DataTable, Field, Money, Rate, Skeleton, toMinorUnits } from '@depawn/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Navigate, createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import type { ReactElement } from 'react';
import { useCurrentAccount } from '../current-account';
import { marketKeys } from '../market-keys';
import { MarketShell } from '../market-shell';
import { walletKeys } from '../wallet-keys';

export const Route = createFileRoute('/listings/$listingId')({
  component: ListingDetailPage,
});

function ListingDetailPage(): ReactElement | null {
  const currentAccount = useCurrentAccount();
  const { listingId } = Route.useParams();

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
      <ListingDetail listingId={listingId} viewerAccountId={currentAccount.data.id} />
    </MarketShell>
  );
}

function ListingDetail({
  listingId,
  viewerAccountId,
}: {
  readonly listingId: string;
  readonly viewerAccountId: string;
}): ReactElement {
  const detailQuery = useQuery({
    queryKey: marketKeys.detail(listingId),
    queryFn: () => fetchListing(listingId),
  });

  if (detailQuery.isPending) {
    return <Skeleton lineCount={6} />;
  }
  if (detailQuery.isError || detailQuery.data === undefined) {
    return (
      <Card title="Listing">
        <p role="alert" className="font-body text-sm text-status-danger">
          The listing could not be loaded.
        </p>
      </Card>
    );
  }

  const detail = detailQuery.data;
  // A borrower funds no offer on their own collateral, so the two sides of
  // this screen are mutually exclusive.
  const isBorrower = detail.borrowerAccountId === viewerAccountId;
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <Card title="The item">
        <dl className="flex flex-wrap gap-8">
          <div>
            <dt className="font-body text-sm text-ink-secondary">Appraised value</dt>
            <dd>
              <Money value={detail.appraisedValue} />
            </dd>
          </div>
          <div>
            <dt className="font-body text-sm text-ink-secondary">Requested principal</dt>
            <dd data-testid="requested-principal">
              <Money value={detail.requestedPrincipal} />
            </dd>
          </div>
          <div>
            <dt className="font-body text-sm text-ink-secondary">Lending ceiling</dt>
            <dd data-testid="max-principal">
              <Money value={detail.maxPrincipal} />
            </dd>
          </div>
          <div>
            <dt className="font-body text-sm text-ink-secondary">Maximum rate</dt>
            <dd>
              <Rate basisPoints={detail.maxAnnualPercentageRateBasisPoints} />
            </dd>
          </div>
        </dl>
      </Card>
      <OfferBookCard detail={detail} isBorrower={isBorrower} />
      {detail.status === 'ACTIVE' && !isBorrower ? <PlaceOfferCard detail={detail} /> : null}
    </div>
  );
}

function acceptMessageFor(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === 'LISTING_ALREADY_MATCHED') {
      return 'This listing already took an offer. Refresh to see the loan.';
    }
    if (error.code === 'OFFER_NOT_PENDING' || error.code === 'OFFER_EXPIRED') {
      return 'That offer is no longer available. Refresh the offer book.';
    }
    if (error.code === 'LOAN_TO_VALUE_EXCEEDED') {
      return 'The principal is now above the lending ceiling for this item.';
    }
  }
  return 'The offer could not be accepted.';
}

function OfferBookCard({
  detail,
  isBorrower,
}: {
  readonly detail: ListingDetailResponse;
  readonly isBorrower: boolean;
}): ReactElement {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [acceptError, setAcceptError] = useState<string | null>(null);
  // Generated on mount and rotated per success (docs/05-frontend.md).
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());

  const acceptMutation = useMutation({
    mutationFn: (offerId: string) => acceptOffer(detail.id, offerId, { idempotencyKey }),
    onSuccess: async () => {
      setIdempotencyKey(crypto.randomUUID());
      setAcceptError(null);
      await queryClient.invalidateQueries({ queryKey: marketKeys.detail(detail.id) });
      await queryClient.invalidateQueries({ queryKey: marketKeys.myListings });
      await queryClient.invalidateQueries({ queryKey: marketKeys.myLoans('borrower') });
      await queryClient.invalidateQueries({ queryKey: walletKeys.all });
      await navigate({ to: '/borrow/loans' });
    },
    onError: (error) => setAcceptError(acceptMessageFor(error)),
  });

  const canAccept = isBorrower && detail.status === 'ACTIVE';
  return (
    <Card title="Offer book, cheapest first">
      {acceptError === null ? null : (
        <p role="alert" className="mb-3 font-body text-sm text-status-danger">
          {acceptError}
        </p>
      )}
      <div data-testid="offer-book">
        <DataTable
          columns={[
            {
              key: 'rate',
              header: 'Rate',
              render: (offer: RankedOfferResponse) => (
                <Rate basisPoints={offer.annualPercentageRateBasisPoints} />
              ),
            },
            {
              key: 'principal',
              header: 'Principal',
              render: (offer: RankedOfferResponse) => <Money value={offer.principal} />,
            },
            {
              key: 'cost',
              header: 'Total cost to borrower',
              render: (offer: RankedOfferResponse) => <Money value={offer.totalCostToBorrower} />,
            },
            ...(canAccept
              ? [
                  {
                    key: 'actions',
                    header: '',
                    render: (offer: RankedOfferResponse) =>
                      offer.status === 'PENDING' ? (
                        <Button
                          data-testid={`accept-${offer.id}`}
                          onClick={() => acceptMutation.mutate(offer.id)}
                          disabled={acceptMutation.isPending}
                        >
                          Accept
                        </Button>
                      ) : null,
                  },
                ]
              : []),
          ]}
          rows={[...detail.offerBook]}
          rowKey={(offer) => offer.id}
          emptyTitle="No offers yet"
        />
      </div>
    </Card>
  );
}

function offerMessageFor(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === 'LOAN_TO_VALUE_EXCEEDED') {
      return 'The principal is above the lending ceiling for this item.';
    }
    if (error.code === 'RATE_ABOVE_MAXIMUM') {
      return 'The rate is above the maximum for this listing.';
    }
    if (error.code === 'INSUFFICIENT_FUNDS') {
      return 'Your available balance does not cover this principal.';
    }
  }
  return 'The offer could not be placed.';
}

function PlaceOfferCard({ detail }: { readonly detail: ListingDetailResponse }): ReactElement {
  const queryClient = useQueryClient();
  const [principalInput, setPrincipalInput] = useState(
    (BigInt(detail.requestedPrincipal.minorUnits) / 100n).toString(),
  );
  const [rateInput, setRateInput] = useState('18.00');
  const [inputError, setInputError] = useState<string | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());

  const principalMinorUnits = toMinorUnits(principalInput);
  const isAboveCeiling =
    principalMinorUnits !== null &&
    BigInt(principalMinorUnits) > BigInt(detail.maxPrincipal.minorUnits);

  const offerMutation = useMutation({
    mutationFn: (input: { minorUnits: string; rateBasisPoints: number }) =>
      placeOffer(
        detail.id,
        {
          principal: { minorUnits: input.minorUnits, currency: 'AUD' },
          annualPercentageRateBasisPoints: input.rateBasisPoints,
          durationMs: detail.requestedDurationMs,
          expiresAt: detail.expiresAt,
        },
        { idempotencyKey },
      ),
    onSuccess: async () => {
      setIdempotencyKey(crypto.randomUUID());
      await queryClient.invalidateQueries({ queryKey: marketKeys.detail(detail.id) });
      await queryClient.invalidateQueries({ queryKey: marketKeys.myOffers });
      await queryClient.invalidateQueries({ queryKey: walletKeys.all });
    },
  });

  return (
    <Card title="Place an offer">
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (principalMinorUnits === null) {
            setInputError('Enter a principal like 2500 or 2500.00.');
            return;
          }
          const rateBasisPoints = toMinorUnits(rateInput);
          if (rateBasisPoints === null) {
            setInputError('Enter a rate like 18.00.');
            return;
          }
          setInputError(null);
          offerMutation.mutate({
            minorUnits: principalMinorUnits,
            rateBasisPoints: Number(rateBasisPoints),
          });
        }}
      >
        <Field
          label="Principal (AUD)"
          data-testid="offer-principal"
          value={principalInput}
          onChange={(event) => setPrincipalInput(event.target.value)}
          errorMessage={
            inputError ?? (isAboveCeiling ? 'Above the lending ceiling for this item.' : undefined)
          }
        />
        <Field
          label="Annual rate (% per year)"
          data-testid="offer-rate"
          value={rateInput}
          onChange={(event) => setRateInput(event.target.value)}
        />
        <Button
          data-testid="offer-submit"
          type="submit"
          disabled={offerMutation.isPending || isAboveCeiling}
        >
          Place funded offer
        </Button>
        {offerMutation.isError ? (
          <p role="alert" className="font-body text-sm text-status-danger">
            {offerMessageFor(offerMutation.error)}
          </p>
        ) : null}
      </form>
    </Card>
  );
}
