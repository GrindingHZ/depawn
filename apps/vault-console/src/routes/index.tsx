import { logout } from '@depawn/contracts';
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
    return null;
  }
  if (currentAccount.data === null || currentAccount.data === undefined) {
    return <Navigate to="/login" />;
  }
  if (!currentAccount.data.roles.includes('VAULT_STAFF')) {
    return (
      <main>
        <p data-testid="access-denied">You do not have access to the vault console.</p>
      </main>
    );
  }

  return (
    <main data-testid="authenticated-home">
      <h1>Vault console</h1>
      <p data-testid="account-email">{currentAccount.data.email}</p>
      <button type="button" onClick={() => logoutMutation.mutate()}>
        Log out
      </button>
    </main>
  );
}
