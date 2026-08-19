import type { ReactElement, ReactNode } from 'react';

export interface AppShellProps {
  readonly productName: string;
  readonly navigation: ReactNode;
  readonly actions?: ReactNode;
  readonly children: ReactNode;
  /* 'terminal' switches the density tokens for the vault console. 'floor' is
     the marketplace workspace, the one scope permitted to fork the palette
     (docs/13-design-system.md, P0.6 amendment). */
  readonly surface?: 'default' | 'terminal' | 'floor';
  /* The workspace manages its own scrolling per pane, so it needs the shell
     to give it the viewport rather than a padded document flow. */
  readonly fills?: boolean;
}

export function AppShell({
  productName,
  navigation,
  actions,
  children,
  surface = 'default',
  fills = false,
}: AppShellProps): ReactElement {
  return (
    <div
      data-surface={surface === 'default' ? undefined : surface}
      className={`flex flex-col bg-surface-base font-body text-ink-primary ${
        fills ? 'h-screen min-h-0' : 'min-h-screen'
      }`}
    >
      <header className="flex min-h-row items-center justify-between gap-4 border-b border-edge bg-surface-raised px-4">
        <span className="font-heading text-base font-semibold">{productName}</span>
        <nav aria-label="Primary" className="flex items-center gap-4">
          {navigation}
        </nav>
        <div className="flex items-center gap-2">{actions}</div>
      </header>
      <main className={fills ? 'min-h-0 flex-1' : 'flex-1 p-6'}>{children}</main>
    </div>
  );
}
