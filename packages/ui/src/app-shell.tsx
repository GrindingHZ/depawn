import type { ReactElement, ReactNode } from 'react';

export interface AppShellProps {
  readonly productName: string;
  readonly navigation: ReactNode;
  readonly actions?: ReactNode;
  readonly children: ReactNode;
  /* 'terminal' switches the density tokens for the vault console. */
  readonly surface?: 'default' | 'terminal';
}

export function AppShell({
  productName,
  navigation,
  actions,
  children,
  surface = 'default',
}: AppShellProps): ReactElement {
  return (
    <div
      data-surface={surface === 'terminal' ? 'terminal' : undefined}
      className="flex min-h-screen flex-col bg-surface-base font-body text-ink-primary"
    >
      <header className="flex min-h-row items-center justify-between gap-4 border-b border-edge bg-surface-raised px-4">
        <span className="font-heading text-base font-semibold">{productName}</span>
        <nav aria-label="Primary" className="flex items-center gap-4">
          {navigation}
        </nav>
        <div className="flex items-center gap-2">{actions}</div>
      </header>
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
