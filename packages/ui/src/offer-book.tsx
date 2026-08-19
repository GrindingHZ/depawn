import type { CSSProperties, ReactElement } from 'react';
import { EmptyState } from './empty-state';
import type { MarketRole } from './market-delta';
import { formatMoney } from './money';
import type { MoneyValue } from './money';
import { accumulateDepth } from './offer-depth';
import type { DepthInput } from './offer-depth';
import { formatRate } from './rate';

export interface OfferBookOffer extends DepthInput {
  readonly totalCostToBorrower?: MoneyValue;
  readonly isMine?: boolean;
}

/* An escape rather than an HTML numeric entity. The token check scans for a
   hash followed by hex digits, and a numeric entity for this glyph looks
   exactly like one. */
const bestMarker = '▸';

export interface OfferBookProps {
  readonly offers: readonly OfferBookOffer[];
  readonly role: MarketRole;
  readonly currency: string;
  readonly selectedOfferId?: string | null;
  readonly onSelectOffer?: (offerId: string) => void;
}

/* The one screen in the product that is genuinely an order book. Cheapest
   first, depth accumulating downwards, and the winning row marked by weight
   and a word rather than by colour, because a reader who cannot separate the
   two greens still has to be able to see which offer wins. */
export function OfferBook({
  offers,
  role,
  currency,
  selectedOfferId,
  onSelectOffer,
}: OfferBookProps): ReactElement {
  const rows = accumulateDepth(offers);

  if (rows.length === 0) {
    return (
      <EmptyState
        title="No offers yet"
        description={
          role === 'borrower'
            ? 'Lenders have not bid on this listing yet. The rate you pay is whatever the best of them offers.'
            : 'Nobody has bid on this listing yet. The first offer sets the rate to beat.'
        }
      />
    );
  }

  const extras = new Map(offers.map((offer) => [offer.id, offer]));

  return (
    <table className="w-full border-collapse font-mono text-xs tabular-nums">
      <caption className="sr-only">
        Offers on this listing, cheapest first. Rates are per annum.
      </caption>
      <thead>
        <tr className="text-ink-secondary">
          <th scope="col" className="px-3 py-1 text-left font-medium">
            Rate p.a.
          </th>
          <th scope="col" className="px-3 py-1 text-right font-medium">
            Amount
          </th>
          <th scope="col" className="px-3 py-1 text-right font-medium">
            Cumulative
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const extra = extras.get(row.offerId);
          const isSelected = selectedOfferId === row.offerId;
          return (
            <tr
              key={row.offerId}
              data-best={row.isBest ? 'true' : undefined}
              data-selected={isSelected ? 'true' : undefined}
              className={`h-row-floor border-t border-edge ${
                isSelected ? 'bg-surface-sunken outline outline-1 outline-edge-strong' : ''
              }`}
            >
              <td className="relative p-0">
                <button
                  type="button"
                  onClick={() => onSelectOffer?.(row.offerId)}
                  aria-pressed={isSelected}
                  className="relative flex w-full items-center gap-2 px-3 py-1 text-left transition-colors duration-control ease-enter hover:bg-surface-sunken focus-visible:outline focus-visible:outline-2 focus-visible:outline-status-active"
                >
                  {/* The depth bar. A ratio arrives as a custom property so
                      the width is data and the colour stays a token. */}
                  <span
                    aria-hidden="true"
                    style={{ '--depth-share': `${row.cumulativeShare * 100}%` } as CSSProperties}
                    className="pointer-events-none absolute inset-y-0 left-0 w-[var(--depth-share)] bg-accent opacity-10"
                  />
                  <span className="relative">
                    {row.isBest ? (
                      <span aria-hidden="true" className="mr-1 text-accent">
                        {bestMarker}
                      </span>
                    ) : null}
                    {formatRate(row.annualPercentageRateBasisPoints).replace(' p.a.', '')}
                  </span>
                  {row.isBest ? <span className="relative text-accent">best</span> : null}
                  {extra?.isMine === true ? (
                    <span className="relative text-ink-secondary">yours</span>
                  ) : null}
                </button>
              </td>
              <td className="px-3 py-1 text-right text-ink-primary">
                {formatMoney({ minorUnits: row.principalMinorUnits.toString(), currency })}
              </td>
              <td className="px-3 py-1 text-right text-ink-secondary">
                {formatMoney({ minorUnits: row.cumulativeMinorUnits.toString(), currency })}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
