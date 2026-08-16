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
  const isOperator =
    currentAccount.data.roles.includes('OPERATIONS') ||
    currentAccount.data.roles.includes('COMPLIANCE');
  if (!isOperator) {
    return (
      <main className="p-6">
        <p data-testid="access-denied" className="font-body text-sm text-ink-primary">
          You do not have access to the admin console.
        </p>
      </main>
    );
  }

  return (
    <div data-testid="authenticated-home">
      <AppShell
        productName="depawn admin"
        navigation={
          <>
            <Link to="/liquidations" className="font-body text-sm text-ink-secondary">
              Liquidations
            </Link>
            <Link to="/operations" className="font-body text-sm text-ink-secondary">
              Operations
            </Link>
            <Link to="/deposits" className="font-body text-sm text-ink-secondary">
              Deposits
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
          description="The loan book, reconciliation, and parameters arrive with later phases."
        />
      </AppShell>
    </div>
  );
}
