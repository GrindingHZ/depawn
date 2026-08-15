import { Navigate } from '@tanstack/react-router';
import type { ReactElement, ReactNode } from 'react';
import { Skeleton } from '@depawn/ui';
import { useCurrentAccount } from './current-account';

/* Wraps every console screen: loading skeleton, login redirect, and the
   staff role gate in one place. */
export function StaffGuard({ children }: { readonly children: ReactNode }): ReactElement | null {
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
  if (!currentAccount.data.roles.includes('VAULT_STAFF')) {
    return (
      <main className="p-6">
        <p data-testid="access-denied" className="font-body text-sm text-ink-primary">
          You do not have access to the vault console.
        </p>
      </main>
    );
  }
  return <>{children}</>;
}
