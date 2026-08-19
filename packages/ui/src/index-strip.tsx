import type { ReactElement } from 'react';
import { MarketDelta } from './market-delta';
import type { MarketRole } from './market-delta';

export interface IndexEntry {
  readonly category: string;
  readonly categoryName: string;
  readonly liveListings: number;
  readonly averageRateBasisPoints: number | null;
  readonly previousAverageRateBasisPoints: number | null;
}

export interface IndexStripProps {
  readonly entries: readonly IndexEntry[];
  readonly role: MarketRole;
  readonly selectedCategory?: string | null;
  readonly onSelectCategory?: (category: string | null) => void;
}

/* What each category costs today and which way it moved. The strip is a
   convenience, never a dependency: when its query fails it renders nothing
   and no action on the workspace becomes unreachable. */
export function IndexStrip({
  entries,
  role,
  selectedCategory,
  onSelectCategory,
}: IndexStripProps): ReactElement | null {
  if (entries.length === 0) {
    return null;
  }

  return (
    <div
      role="group"
      aria-label="Average rate by category"
      className="flex items-center gap-1 overflow-x-auto border-b border-edge bg-surface-sunken px-3 py-1"
    >
      {entries.map((entry) => {
        const isSelected = selectedCategory === entry.category;
        return (
          <button
            key={entry.category}
            type="button"
            aria-pressed={isSelected}
            onClick={() => onSelectCategory?.(isSelected ? null : entry.category)}
            className={`flex shrink-0 items-center gap-2 rounded-sm px-2 py-1 text-left transition-colors duration-control ease-enter hover:bg-surface-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-status-active ${
              isSelected ? 'bg-surface-raised' : ''
            }`}
          >
            <span className="font-mono text-xs uppercase tracking-wide text-ink-secondary">
              {entry.categoryName}
            </span>
            {entry.averageRateBasisPoints === null ? (
              /* No offers is not a rate of zero, and saying zero here would
                 read as free money. */
              <span className="font-mono text-xs text-ink-secondary">no offers</span>
            ) : (
              <MarketDelta
                currentBasisPoints={entry.averageRateBasisPoints}
                previousBasisPoints={entry.previousAverageRateBasisPoints}
                role={role}
              />
            )}
            <span className="font-mono text-xs text-ink-secondary">{entry.liveListings} live</span>
          </button>
        );
      })}
    </div>
  );
}
