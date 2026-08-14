import { logout } from '@depawn/contracts';
import { AppShell, Button, EmptyState, Skeleton } from '@depawn/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, Navigate, createFileRoute, useNavigate } from '@tanstack/react-router';
import type { ReactElement } from 'react';
import { currentAccountKeys, useCurrentAccount } from '../current-account';

export const Route = createFileRoute('/')({
  component: HomePage,
});

function HomePage(): ReactElement | null {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const currentAccount = useCurrentAccount();
  const logoutMutation = useMutation({
    mutationFn: logout,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: currentAccountKeys.me });
      await navigate({ to: '/login' });
    },
  });

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
      <AppShell
        productName="depawn marketplace"
        navigation={
          <>
            <Link to="/wallet" className="font-body text-sm text-ink-secondary">
              Wallet
            </Link>
            <span data-testid="account-email">{currentAccount.data.email}</span>
          </>
        }
        actions={
          <Button variant="secondary" onClick={() => logoutMutation.mutate()}>
            Log out
          </Button>
        }
      >
        <EmptyState
          title="Nothing to show yet"
          description="Listings, offers, and loans arrive with the next build phases."
        />
      </AppShell>
    </div>
  );
}
