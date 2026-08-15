import { fetchMyOffers } from '@depawn/contracts';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import type { ReactElement } from 'react';
import { marketKeys } from './market-keys';

/* Superseded and expired holds are money the member cannot spend and may not
   know about; the banner is impossible to miss wherever it renders
   (docs/10-flows.md flow 4 design note). */
export function ReclaimBanner(): ReactElement | null {
  const offersQuery = useQuery({ queryKey: marketKeys.myOffers, queryFn: fetchMyOffers });
  const reclaimable = (offersQuery.data?.items ?? []).filter(
    (offer) => offer.status === 'SUPERSEDED' || offer.status === 'EXPIRED',
  );

  if (reclaimable.length === 0) {
    return null;
  }
  return (
    <div
      data-testid="reclaim-banner"
      className="mb-6 rounded-md border-l-4 border-status-warning bg-surface-raised p-4"
    >
      <p className="font-body text-sm text-ink-primary">
        You have {reclaimable.length} held offer{reclaimable.length === 1 ? '' : 's'} waiting to be
        reclaimed.{' '}
        <Link to="/lend/offers" className="text-status-active">
          Reclaim your funds
        </Link>
      </p>
    </div>
  );
}
