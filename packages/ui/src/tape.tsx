import type { ReactElement } from 'react';
import { formatMoney } from './money';
import type { MoneyValue } from './money';
import { formatRate } from './rate';

export type TapeEventKind = 'OFFER_PLACED' | 'LOAN_ORIGINATED';

export interface TapeItem {
  readonly at: string;
  readonly kind: TapeEventKind;
  readonly listingId: string;
  readonly itemDescription: string;
  readonly rateBasisPoints: number;
  readonly amount: MoneyValue;
}

export interface TapeProps {
  readonly items: readonly TapeItem[];
  readonly selectedListingId?: string | null;
  readonly onSelectListing?: (listingId: string) => void;
}

const verbs: Record<TapeEventKind, string> = {
  OFFER_PLACED: 'offered',
  LOAN_ORIGINATED: 'funded',
};

/* Clock time, not a relative phrase. A tape is read by glancing at it, and
   "3 minutes ago" forces the reader to work out when that was against a
   clock that has already moved on. */
function timeOf(iso: string): string {
  const parsed = Date.parse(iso);
  if (!Number.isFinite(parsed)) {
    return '';
  }
  return new Date(parsed).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

/* Everything happening across every listing, newest first. Like the index
   strip it is decoration with a job: it renders nothing when empty and takes
   no action away from the workspace when its query fails. */
export function Tape({
  items,
  selectedListingId,
  onSelectListing,
}: TapeProps): ReactElement | null {
  if (items.length === 0) {
    return null;
  }

  return (
    <div
      role="log"
      aria-label="Recent market activity"
      aria-live="off"
      className="flex items-center gap-4 overflow-x-auto border-t border-edge bg-surface-sunken px-3 py-1"
    >
      {items.map((item, index) => (
        <button
          key={`${item.listingId}-${item.at}-${String(index)}`}
          type="button"
          onClick={() => onSelectListing?.(item.listingId)}
          className={`flex shrink-0 items-center gap-2 whitespace-nowrap rounded-sm px-2 py-0.5 font-mono text-xs transition-colors duration-control ease-enter hover:bg-surface-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-status-active ${
            selectedListingId === item.listingId ? 'bg-surface-raised' : ''
          }`}
        >
          <span className="text-ink-secondary">{timeOf(item.at)}</span>
          <span className="max-w-48 truncate text-ink-primary">{item.itemDescription}</span>
          <span className="text-ink-secondary">{verbs[item.kind]}</span>
          <span className="text-ink-primary">
            {formatRate(item.rateBasisPoints).replace(' p.a.', '')}
          </span>
          <span className="text-ink-secondary">{formatMoney(item.amount)}</span>
        </button>
      ))}
    </div>
  );
}
