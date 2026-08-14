import { logout } from '@depawn/contracts';
import { AppShell, Button, EmptyState, Skeleton } from '@depawn/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Navigate, createFileRoute, useNavigate } from '@tanstack/react-router';
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
  if (!currentAccount.data.roles.includes('VAULT_STAFF')) {
    return (
      <main className="p-6">
        <p data-testid="access-denied" className="font-body text-sm text-ink-primary">
          You do not have access to the vault console.
        </p>
      </main>
    );
  }

  return (
    <div data-testid="authenticated-home">
      <AppShell
        productName="depawn vault console"
        surface="terminal"
        navigation={<span data-testid="account-email">{currentAccount.data.email}</span>}
        actions={
          <Button variant="secondary" onClick={() => logoutMutation.mutate()}>
            Log out
          </Button>
        }
      >
        <EmptyState
          title="Nothing to show yet"
          description="Intake, inventory, and releases arrive with the custody phase."
        />
      </AppShell>
    </div>
  );
}
