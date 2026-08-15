import { logout } from '@depawn/contracts';
import { AppShell, Button } from '@depawn/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import type { ReactElement, ReactNode } from 'react';
import { currentAccountKeys } from './current-account';
import { ReclaimBanner } from './reclaim-banner';

/* The one authenticated shell for every marketplace screen, so navigation
   stays consistent while routes multiply. */
export function MarketShell({ children }: { readonly children: ReactNode }): ReactElement {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const logoutMutation = useMutation({
    mutationFn: logout,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: currentAccountKeys.me });
      await navigate({ to: '/login' });
    },
  });

  return (
    <AppShell
      productName="depawn marketplace"
      navigation={
        <>
          <Link to="/listings" className="font-body text-sm text-ink-secondary">
            Browse
          </Link>
          <Link to="/borrow/receipts" className="font-body text-sm text-ink-secondary">
            My receipts
          </Link>
          <Link to="/borrow/listings" className="font-body text-sm text-ink-secondary">
            My listings
          </Link>
          <Link to="/borrow/loans" className="font-body text-sm text-ink-secondary">
            My loans
          </Link>
          <Link to="/lend/offers" className="font-body text-sm text-ink-secondary">
            My offers
          </Link>
          <Link to="/lend/loans" className="font-body text-sm text-ink-secondary">
            Funded loans
          </Link>
          <Link to="/wallet" className="font-body text-sm text-ink-secondary">
            Wallet
          </Link>
        </>
      }
      actions={
        <Button variant="secondary" onClick={() => logoutMutation.mutate()}>
          Log out
        </Button>
      }
    >
      <ReclaimBanner />
      {children}
    </AppShell>
  );
}
