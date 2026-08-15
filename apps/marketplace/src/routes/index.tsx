import { EmptyState, Skeleton } from '@depawn/ui';
import { Navigate, createFileRoute } from '@tanstack/react-router';
import type { ReactElement } from 'react';
import { useCurrentAccount } from '../current-account';
import { MarketShell } from '../market-shell';
import { ReclaimBanner } from '../reclaim-banner';

export const Route = createFileRoute('/')({
  component: HomePage,
});

function HomePage(): ReactElement | null {
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
    <div data-testid="authenticated-home">
      <MarketShell>
        <p data-testid="account-email" className="mb-4 font-body text-sm text-ink-secondary">
          {currentAccount.data.email}
        </p>
        <ReclaimBanner />
        <EmptyState
          title="Borrow or lend"
          description="Browse live listings to lend, or list one of your receipts to borrow."
        />
      </MarketShell>
    </div>
  );
}
