import {
  ApiError,
  acceptOffer,
  fetchListing,
  liquidityNoteForCategory,
  messageForError,
  nameForCategory,
} from '@depawn/contracts';
import type { ListingDetailResponse, MoneyDto } from '@depawn/contracts';
import {
  Button,
  Explain,
  ItemPhotograph,
  LoanToValue,
  MarketDelta,
  Money,
  OfferBook,
  Rate,
  RateHistory,
  Skeleton,
  WorkspacePrompt,
  bestRateSeries,
} from '@depawn/ui';
import type { MarketRole } from '@depawn/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import type { ReactElement } from 'react';
import { marketKeys } from '../market-keys';
import { walletKeys } from '../wallet-keys';
import { PlaceOfferForm } from './place-offer-form';

export interface DetailPaneProps {
  readonly listingId: string | null;
  readonly viewerAccountId: string;
  readonly selectedOfferId: string | null;
  readonly onSelectOffer: (offerId: string) => void;
  /* Computed by the route from the same query, so the spine and this pane
     never disagree about which side the reader is on. */
  readonly role: MarketRole;
}

export function DetailPane({
  listingId,
  viewerAccountId,
  selectedOfferId,
  onSelectOffer,
  role,
}: DetailPaneProps): ReactElement {
  if (listingId === null) {
    return (
      <WorkspacePrompt
        title="Pick a listing"
        description="Choose an item on the left to see its appraisal, how the rate has moved, and who is offering against it."
      />
    );
  }
  return (
    <LoadedDetail
      key={listingId}
      listingId={listingId}
      viewerAccountId={viewerAccountId}
      selectedOfferId={selectedOfferId}
      onSelectOffer={onSelectOffer}
      role={role}
    />
  );
}

function LoadedDetail({
  listingId,
  viewerAccountId,
  selectedOfferId,
  onSelectOffer,
  role,
}: DetailPaneProps & { readonly listingId: string }): ReactElement {
  const detailQuery = useQuery({
    queryKey: marketKeys.detail(listingId),
    queryFn: () => fetchListing(listingId),
    retry: false,
  });

  if (detailQuery.isPending) {
    return (
      <div className="p-4">
        <Skeleton lineCount={6} />
      </div>
    );
  }

  /* Not found and not visible answer the same way on the wire, so the pane
     says the same thing for both and offers a way back rather than stranding
     the reader on a dead selection. */
  if (detailQuery.isError || detailQuery.data === undefined) {
    return (
      <WorkspacePrompt
        title="That listing is not available"
        description="It may have closed, been cancelled, or never been public. Pick another on the left."
      />
    );
  }

  return (
    <DetailBody
      detail={detailQuery.data}
      viewerAccountId={viewerAccountId}
      selectedOfferId={selectedOfferId}
      onSelectOffer={onSelectOffer}
      role={role}
    />
  );
}

function DetailBody({
  detail,
  viewerAccountId,
  selectedOfferId,
  onSelectOffer,
  role,
}: {
  readonly detail: ListingDetailResponse;
  readonly viewerAccountId: string;
  readonly selectedOfferId: string | null;
  readonly onSelectOffer: (offerId: string) => void;
  readonly role: MarketRole;
}): ReactElement {
  const isBorrower = role === 'borrower';
  const series = bestRateSeries(
    detail.offerBook.map((offer) => ({
      createdAt: offer.createdAt,
      annualPercentageRateBasisPoints: offer.annualPercentageRateBasisPoints,
    })),
  );
  const best = series[series.length - 1];
  const previous = series.length > 1 ? series[series.length - 2] : undefined;
  const selected = detail.offerBook.find((offer) => offer.id === selectedOfferId);

  return (
    <div className="flex flex-col">
      <header className="flex items-start gap-4 border-b border-edge p-4">
        <ItemPhotograph
          src={detail.hasPhotograph ? `/api/v1/receipts/${detail.receiptId}/photo` : null}
          alt={detail.itemDescription}
          size="detail"
          testId="item-photograph"
        />
        <div className="min-w-0 flex-1">
          <h2
            data-testid="item-description"
            className="font-heading text-lg font-semibold text-ink-primary"
          >
            {detail.itemDescription}
          </h2>
          <p className="mt-1 font-body text-sm text-ink-secondary">
            {nameForCategory(detail.itemCategory)}
            {liquidityNoteForCategory(detail.itemCategory) === null
              ? null
              : `. ${liquidityNoteForCategory(detail.itemCategory) ?? ''}`}
          </p>
          {best === undefined ? null : (
            <div className="mt-3">
              <MarketDelta
                currentBasisPoints={best.basisPoints}
                previousBasisPoints={previous?.basisPoints ?? null}
                role={role}
                label="best rate offered"
              />
            </div>
          )}
        </div>
      </header>

      <div className="flex flex-col xl:flex-row">
        <div className="min-w-0 flex-1 border-edge p-4 xl:border-r">
          <RateHistory
            points={series}
            role={role}
            highlightAtEpochMs={selected === undefined ? null : Date.parse(selected.createdAt)}
          />
          <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
            <Figure
              label="Appraised value"
              explain={<Explain termId="appraisedValue" audience={audienceOf(role)} />}
            >
              <Money value={detail.appraisedValue} />
            </Figure>
            <Figure label="Requested principal" testId="requested-principal">
              <Money value={detail.requestedPrincipal} />
            </Figure>
            <Figure
              label="Loan to value"
              explain={<Explain termId="loanToValue" audience={audienceOf(role)} />}
            >
              <LoanToValue basisPoints={detail.loanToValueBasisPoints} testId="detail-ltv" />
            </Figure>
            <Figure
              label="Lending ceiling"
              testId="max-principal"
              explain={<Explain termId="lendingCeiling" audience={audienceOf(role)} />}
            >
              <Money value={detail.maxPrincipal} />
            </Figure>
            <Figure label="Maximum rate">
              <Rate basisPoints={detail.maxAnnualPercentageRateBasisPoints} />
            </Figure>
          </dl>
        </div>

        <div className="w-full shrink-0 xl:w-[22rem]">
          <OfferBookPanel
            detail={detail}
            role={role}
            isBorrower={isBorrower}
            viewerAccountId={viewerAccountId}
            selectedOfferId={selectedOfferId}
            onSelectOffer={onSelectOffer}
          />
          {detail.status === 'ACTIVE' && !isBorrower ? <PlaceOfferForm detail={detail} /> : null}
        </div>
      </div>
    </div>
  );
}

function audienceOf(role: MarketRole): 'borrower' | 'lender' {
  return role;
}

function Figure({
  label,
  children,
  testId,
  explain,
}: {
  readonly label: string;
  readonly children: ReactElement;
  readonly testId?: string;
  readonly explain?: ReactElement;
}): ReactElement {
  return (
    <div>
      <dt className="flex items-center font-body text-xs text-ink-secondary">
        {label}
        {explain}
      </dt>
      <dd
        data-testid={testId}
        className="mt-0.5 font-mono text-base font-semibold tabular-nums text-ink-primary"
      >
        {children}
      </dd>
    </div>
  );
}

function OfferBookPanel({
  detail,
  role,
  isBorrower,
  viewerAccountId,
  selectedOfferId,
  onSelectOffer,
}: {
  readonly detail: ListingDetailResponse;
  readonly role: MarketRole;
  readonly isBorrower: boolean;
  readonly viewerAccountId: string;
  readonly selectedOfferId: string | null;
  readonly onSelectOffer: (offerId: string) => void;
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
      // The collateral becomes ENCUMBERED in the same transaction, so a
      // cached receipts screen would still offer it for listing.
      await queryClient.invalidateQueries({ queryKey: marketKeys.myReceipts });
      await queryClient.invalidateQueries({ queryKey: walletKeys.all });
      await navigate({ to: '/borrow/loans' });
    },
    onError: (error) => setAcceptError(acceptMessageFor(error)),
  });

  const pending = detail.offerBook.filter((offer) => offer.status === 'PENDING');
  const canAccept = isBorrower && detail.status === 'ACTIVE';
  const chosen = pending.find((offer) => offer.id === selectedOfferId);

  return (
    <div data-testid="offer-book" className="border-b border-edge">
      <h3 className="border-b border-edge bg-surface-sunken px-3 py-1 font-mono text-xs uppercase tracking-wide text-ink-secondary">
        Offer book
      </h3>
      {acceptError === null ? null : (
        <p role="alert" className="p-3 font-body text-sm text-status-danger">
          {acceptError}
        </p>
      )}
      <OfferBook
        offers={pending.map((offer) => ({
          id: offer.id,
          annualPercentageRateBasisPoints: offer.annualPercentageRateBasisPoints,
          principal: offer.principal,
          totalCostToBorrower: offer.totalCostToBorrower,
          isMine: offer.lenderAccountId === viewerAccountId,
        }))}
        role={role}
        currency={detail.requestedPrincipal.currency}
        selectedOfferId={selectedOfferId}
        onSelectOffer={onSelectOffer}
      />
      {chosen === undefined ? null : (
        <div className="border-t border-edge p-3">
          {/* Two figures, never one. A total cost sitting beside a principal
              reads as the total to repay, which it is not. */}
          <dl className="flex flex-col gap-1 font-mono text-xs">
            <div className="flex justify-between">
              <dt className="text-ink-secondary">Interest</dt>
              <dd className="text-ink-primary">
                <Money value={chosen.totalCostToBorrower} />
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-secondary">Total repayable</dt>
              <dd className="font-semibold text-ink-primary">
                <Money value={sumOf(chosen.principal, chosen.totalCostToBorrower)} />
              </dd>
            </div>
          </dl>
          {canAccept ? (
            <Button
              data-testid={`accept-${chosen.id}`}
              onClick={() => acceptMutation.mutate(chosen.id)}
              disabled={acceptMutation.isPending}
              className="mt-3 w-full"
            >
              Accept this offer
            </Button>
          ) : null}
        </div>
      )}
      {canAccept && chosen === undefined && pending.length > 0 ? (
        <p className="border-t border-edge p-3 font-body text-xs text-ink-secondary">
          Choose an offer above to see what it costs and accept it.
        </p>
      ) : null}
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
  return messageForError(error, 'The offer could not be accepted.');
}

/* Money is minor units in a string, so the addition is bigint and never a
   float. Two amounts on one loan always share a currency. */
function sumOf(left: MoneyDto, right: MoneyDto): MoneyDto {
  return {
    minorUnits: (BigInt(left.minorUnits) + BigInt(right.minorUnits)).toString(),
    currency: left.currency,
  };
}
