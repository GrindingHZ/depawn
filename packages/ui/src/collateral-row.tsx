import type { ReactElement } from 'react';
import { ItemPhotograph } from './item-photograph';
import { LoanToValue } from './loan-to-value';
import { formatMoney } from './money';
import type { MoneyValue } from './money';
import { formatRate } from './rate';

/* What the reader is to this listing. Derived from their relationship rather
   than chosen, so there is no control to leave set wrong. */
export type CollateralRelationship = 'none' | 'borrower' | 'offered' | 'funded';

export interface CollateralItem {
  readonly listingId: string;
  readonly itemDescription: string;
  readonly itemCategory: string;
  readonly categoryName: string;
  readonly appraisedValue: MoneyValue;
  readonly requestedPrincipal: MoneyValue;
  readonly loanToValueBasisPoints: number;
  readonly bestRateBasisPoints: number | null;
  readonly closesIn: string;
  readonly photographSrc: string | null;
  readonly relationship: CollateralRelationship;
}

export interface CollateralProps {
  readonly item: CollateralItem;
  readonly isSelected?: boolean;
  readonly onSelect?: (listingId: string) => void;
}

/* Said in words, never left to a coloured dot. A lender scanning the rail
   needs to know at a glance which of these are already theirs. */
const relationshipReadings: Record<CollateralRelationship, string | null> = {
  none: null,
  borrower: 'yours',
  offered: 'you offered',
  funded: 'you funded',
};

function Relationship({ value }: { readonly value: CollateralRelationship }): ReactElement | null {
  const reading = relationshipReadings[value];
  if (reading === null) {
    return null;
  }
  return (
    <span className="rounded-sm border border-edge-strong px-2 font-mono text-xs text-ink-secondary">
      {reading}
    </span>
  );
}

function AskingRate({ basisPoints }: { readonly basisPoints: number | null }): ReactElement {
  if (basisPoints === null) {
    return <span className="font-mono text-xs text-ink-secondary">no offers</span>;
  }
  return (
    <span className="font-mono text-xs text-ink-primary">
      {formatRate(basisPoints).replace(' p.a.', '')}
    </span>
  );
}

/* The dense form, for comparing many items against each other. */
export function CollateralRow({ item, isSelected, onSelect }: CollateralProps): ReactElement {
  return (
    <button
      type="button"
      onClick={() => onSelect?.(item.listingId)}
      aria-pressed={isSelected === true}
      data-selected={isSelected === true ? 'true' : undefined}
      className={`flex w-full items-start gap-3 border-b border-l-2 border-edge px-3 py-2 text-left transition-colors duration-control ease-enter hover:bg-surface-sunken focus-visible:outline focus-visible:outline-2 focus-visible:outline-status-active ${
        isSelected === true ? 'border-l-status-active bg-surface-sunken' : 'border-l-transparent'
      }`}
    >
      <ItemPhotograph src={item.photographSrc} alt={item.itemDescription} size="thumbnail" />
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex items-baseline justify-between gap-2">
          {/* The description is the identity. It is the only thing that tells
              a lender what they would be lending against. */}
          <span className="truncate font-body text-sm font-medium text-ink-primary">
            {item.itemDescription}
          </span>
          <AskingRate basisPoints={item.bestRateBasisPoints} />
        </span>
        <span className="flex flex-wrap items-center gap-2 font-mono text-xs text-ink-secondary">
          <span>{item.categoryName}</span>
          <LoanToValue basisPoints={item.loanToValueBasisPoints} />
          <span>{formatMoney(item.requestedPrincipal)}</span>
          <span>{item.closesIn}</span>
          <Relationship value={item.relationship} />
        </span>
      </span>
    </button>
  );
}

/* The gallery form, for hunting rather than comparing. Same data, more
   photograph, fewer per screen. */
export function CollateralCard({ item, isSelected, onSelect }: CollateralProps): ReactElement {
  return (
    <button
      type="button"
      onClick={() => onSelect?.(item.listingId)}
      aria-pressed={isSelected === true}
      data-selected={isSelected === true ? 'true' : undefined}
      className={`flex flex-col gap-2 rounded-md border p-2 text-left transition-colors duration-control ease-enter hover:bg-surface-sunken focus-visible:outline focus-visible:outline-2 focus-visible:outline-status-active ${
        isSelected === true ? 'border-status-active bg-surface-sunken' : 'border-edge'
      }`}
    >
      <ItemPhotograph src={item.photographSrc} alt={item.itemDescription} size="detail" />
      <span className="line-clamp-2 font-body text-sm font-medium text-ink-primary">
        {item.itemDescription}
      </span>
      <span className="flex flex-wrap items-center gap-2 font-mono text-xs text-ink-secondary">
        <LoanToValue basisPoints={item.loanToValueBasisPoints} />
        <AskingRate basisPoints={item.bestRateBasisPoints} />
        <Relationship value={item.relationship} />
      </span>
    </button>
  );
}
