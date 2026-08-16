import { Link } from '@tanstack/react-router';
import type { ReactElement } from 'react';

/* Five screens each carried their own copy of this list, so a sixth was
   reachable from one of them and invisible from the others. One list, one
   place to add the next screen. */
const destinations = [
  { to: '/', label: 'Home' },
  { to: '/liquidations', label: 'Liquidations' },
  { to: '/operations', label: 'Operations' },
  { to: '/parameters', label: 'Parameters' },
  { to: '/reconciliation', label: 'Reconciliation' },
  { to: '/deposits', label: 'Deposits' },
] as const;

export interface AdminNavigationProps {
  /* The screen the reader is on, which is the one link that is not a way of
     leaving it. */
  readonly current: (typeof destinations)[number]['to'];
}

export function AdminNavigation({ current }: AdminNavigationProps): ReactElement {
  return (
    <>
      {destinations
        .filter((destination) => destination.to !== '/' || current !== '/')
        .map((destination) => (
          <Link
            key={destination.to}
            to={destination.to}
            className={
              destination.to === current
                ? 'font-body text-sm text-ink-primary'
                : 'font-body text-sm text-ink-secondary'
            }
          >
            {destination.label}
          </Link>
        ))}
    </>
  );
}
