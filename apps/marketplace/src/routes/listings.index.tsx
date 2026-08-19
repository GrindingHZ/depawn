import {
  browseListings,
  fetchListing,
  fetchMarketIndex,
  fetchMarketTape,
  fetchMyOffers,
  nameForCategory,
} from '@depawn/contracts';
import type { ListingSummary } from '@depawn/contracts';
import {
  IndexStrip,
  LifecycleSpine,
  Skeleton,
  Tape,
  Workspace,
  positionOf,
  spineFor,
} from '@depawn/ui';
import type { CollateralRelationship, MarketRole } from '@depawn/ui';
import { useQuery } from '@tanstack/react-query';
import { Navigate, createFileRoute, useNavigate } from '@tanstack/react-router';
import type { ReactElement } from 'react';
import { MarketShell } from '../market-shell';
import { marketKeys } from '../market-keys';
import { useCurrentAccount } from '../current-account';
import { BrowsePane } from '../workspace/browse-pane';
import type { BrowseDensity, BrowseSort } from '../workspace/browse-pane';
import { DetailPane } from '../workspace/detail-pane';
import { defaultDensity, defaultSort, parseWorkspaceSearch } from '../workspace-selection';
import type { WorkspaceSearch } from '../workspace-selection';

export const Route = createFileRoute('/listings/')({
  validateSearch: parseWorkspaceSearch,
  component: WorkspacePage,
});

/* The strip and the tape refresh on a timer. Polling rather than a stream:
   the outbox is at least once (Q-023) and a push transport is a new failure
   mode this screen does not need to earn its keep. */
const tapePollMs = 15_000;

function WorkspacePage(): ReactElement | null {
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
  return <VaultFloor viewerAccountId={currentAccount.data.id} />;
}

function VaultFloor({ viewerAccountId }: { readonly viewerAccountId: string }): ReactElement {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });

  /* Every pane reads the selection from here. Nothing is mirrored into React
     state, so the back button, a refresh and a pasted link all land on the
     same view without any pane knowing the others exist. */
  function update(next: Partial<WorkspaceSearch>): void {
    void navigate({ search: (previous) => ({ ...previous, ...next }), replace: false });
  }

  const category = search.category ?? '';
  const maxLoanToValue = search.maxLoanToValue === undefined ? '' : String(search.maxLoanToValue);
  const sort = search.sort ?? defaultSort;
  const density = search.density ?? defaultDensity;
  const selectedListingId = search.listing ?? null;

  const browseQuery = useQuery({
    queryKey: marketKeys.browseWith(category, maxLoanToValue, sort),
    queryFn: () =>
      browseListings({
        ...(category === '' ? {} : { category }),
        ...(maxLoanToValue === '' ? {} : { maxLoanToValueBasisPoints: Number(maxLoanToValue) }),
        sort,
      }),
  });

  const myOffersQuery = useQuery({ queryKey: marketKeys.myOffers, queryFn: fetchMyOffers });

  const indexQuery = useQuery({
    queryKey: marketKeys.marketIndex,
    queryFn: () => fetchMarketIndex(),
    refetchInterval: tapePollMs,
  });

  const tapeQuery = useQuery({
    queryKey: marketKeys.marketTape,
    queryFn: () => fetchMarketTape(),
    refetchInterval: tapePollMs,
  });

  /* Shares a key with the detail pane, so React Query serves both from one
     request. The route needs it because the spine belongs to the workspace
     rather than to either pane. */
  const selectedQuery = useQuery({
    queryKey: marketKeys.detail(selectedListingId ?? ''),
    queryFn: () => fetchListing(selectedListingId ?? ''),
    enabled: selectedListingId !== null,
    retry: false,
  });

  const myOffers = myOffersQuery.data?.items ?? [];
  const livePendingListingIds = new Set(
    myOffers.filter((offer) => offer.status === 'PENDING').map((offer) => offer.listingId),
  );

  function relationshipFor(listing: ListingSummary): CollateralRelationship {
    return positionOf({
      borrowerAccountId: listing.borrowerAccountId,
      viewerAccountId,
      hasLiveOffer: livePendingListingIds.has(listing.id),
      hasFundedLoan: false,
    }).relationship;
  }

  /* The best rate on a browse row comes from the offers already fetched for
     that listing, so a rail of twenty rows does not become twenty requests.
     A listing nobody has opened yet reports no rate rather than a wrong one. */
  function bestRateFor(listing: ListingSummary): number | null {
    if (selectedQuery.data?.id !== listing.id) {
      return null;
    }
    const pending = selectedQuery.data.offerBook.filter((offer) => offer.status === 'PENDING');
    if (pending.length === 0) {
      return null;
    }
    return Math.min(...pending.map((offer) => offer.annualPercentageRateBasisPoints));
  }

  const selectedDetail = selectedQuery.data;
  const role: MarketRole =
    selectedDetail === undefined
      ? 'lender'
      : positionOf({
          borrowerAccountId: selectedDetail.borrowerAccountId,
          viewerAccountId,
          hasLiveOffer: livePendingListingIds.has(selectedDetail.id),
          hasFundedLoan: false,
        }).role;

  const indexEntries = (indexQuery.data?.categories ?? []).map((entry) => ({
    category: entry.category,
    categoryName: nameForCategory(entry.category),
    liveListings: entry.liveListings,
    averageRateBasisPoints: entry.averageRateBasisPoints,
    previousAverageRateBasisPoints: entry.previousAverageRateBasisPoints,
  }));

  return (
    <MarketShell fills>
      <Workspace
        indexStrip={
          <IndexStrip
            entries={indexEntries}
            role={role}
            selectedCategory={category === '' ? null : category}
            onSelectCategory={(next) =>
              update({ category: next ?? undefined, listing: undefined, offer: undefined })
            }
          />
        }
        browse={
          <BrowsePane
            listings={browseQuery.data?.items ?? []}
            isPending={browseQuery.isPending}
            isError={browseQuery.isError}
            selectedListingId={selectedListingId}
            onSelect={(listingId) => update({ listing: listingId, offer: undefined })}
            relationshipFor={relationshipFor}
            bestRateFor={bestRateFor}
            nowEpochMs={Date.now()}
            category={category}
            onCategory={(value) =>
              update({ category: value === '' ? undefined : value, listing: undefined })
            }
            maxLoanToValue={maxLoanToValue}
            onMaxLoanToValue={(value) =>
              update({ maxLoanToValue: value === '' ? undefined : Number(value) })
            }
            sort={sort as BrowseSort}
            onSort={(value) => update({ sort: value })}
            density={density as BrowseDensity}
            onDensity={(value) => update({ density: value })}
          />
        }
        detail={
          <DetailPane
            listingId={selectedListingId}
            viewerAccountId={viewerAccountId}
            selectedOfferId={search.offer ?? null}
            onSelectOffer={(offerId) => update({ offer: offerId })}
            role={role}
          />
        }
        spine={
          selectedDetail === undefined ? null : (
            <LifecycleSpine
              role={role}
              stages={spineFor(role, selectedDetail.status)}
              onSelectStage={(stage) => update({ stage })}
            />
          )
        }
        tape={
          <Tape
            items={tapeQuery.data?.events ?? []}
            selectedListingId={selectedListingId}
            onSelectListing={(listingId) => update({ listing: listingId, offer: undefined })}
          />
        }
      />
    </MarketShell>
  );
}
