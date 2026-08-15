import { logout } from '@depawn/contracts';
import { AppShell, Button } from '@depawn/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import type { ReactElement, ReactNode } from 'react';
import { currentAccountKeys } from './current-account';

export function ConsoleShell({ children }: { readonly children: ReactNode }): ReactElement {
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
      productName="depawn vault console"
      surface="terminal"
      navigation={
        <Link to="/intake" className="font-body text-sm text-ink-secondary">
          Intake
        </Link>
      }
      actions={
        <Button variant="secondary" onClick={() => logoutMutation.mutate()}>
          Log out
        </Button>
      }
    >
      {children}
    </AppShell>
  );
}
