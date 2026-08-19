import type { ReactElement } from 'react';
import { EmptyState } from './empty-state';
import type { MarketRole } from './market-delta';
import { formatRate } from './rate';
import type { RatePoint } from './rate-series';

export interface RateHistoryProps {
  readonly points: readonly RatePoint[];
  readonly role: MarketRole;
  /* The offer a reader clicked in the book, so the two panes agree about
     which moment they are talking about. */
  readonly highlightAtEpochMs?: number | null;
}

const viewBoxWidth = 200;
const viewBoxHeight = 60;

/* Stepped, never smoothed. Offers land at discrete moments and the rate holds
   flat between them, so a curve would draw a price that was never quoted.
   Hand rolled rather than pulled from a charting library: the series is a
   handful of points, and a dependency would arrive with its own theming layer
   to reconcile against the tokens. */
export function RateHistory({ points, role, highlightAtEpochMs }: RateHistoryProps): ReactElement {
  if (points.length < 2) {
    return (
      <EmptyState
        title="No rate history yet"
        description={
          points.length === 0
            ? 'A line appears once lenders start competing.'
            : 'One offer so far. A line appears when a lender undercuts it.'
        }
      />
    );
  }

  const first = points[0];
  const last = points[points.length - 1];
  if (first === undefined || last === undefined) {
    return <EmptyState title="No rate history yet" />;
  }

  const rates = points.map((point) => point.basisPoints);
  const times = points.map((point) => point.atEpochMs);
  const highestRate = Math.max(...rates);
  const lowestRate = Math.min(...rates);
  const earliest = Math.min(...times);
  const latest = Math.max(...times);

  const rateSpan = highestRate - lowestRate || 1;
  const timeSpan = latest - earliest || 1;

  const xOf = (atEpochMs: number): number => ((atEpochMs - earliest) / timeSpan) * viewBoxWidth;
  /* The best rate falls over a listing's life, so the cheapest sits at the
     bottom of the box and the line descends the way the price does. */
  const yOf = (basisPoints: number): number =>
    viewBoxHeight - ((highestRate - basisPoints) / rateSpan) * viewBoxHeight;

  const commands: string[] = [`M ${xOf(first.atEpochMs)} ${yOf(first.basisPoints)}`];
  for (let index = 1; index < points.length; index += 1) {
    const point = points[index];
    const previous = points[index - 1];
    if (point === undefined || previous === undefined) {
      continue;
    }
    commands.push(`H ${xOf(point.atEpochMs)}`);
    commands.push(`V ${yOf(point.basisPoints)}`);
  }
  /* Hold the last quoted rate out to the right edge. The price did not stop
     existing when the last lender stopped typing. */
  commands.push(`H ${viewBoxWidth}`);

  const tone = role === 'borrower' ? 'text-market-favourable' : 'text-market-adverse';
  const highlighted =
    highlightAtEpochMs === undefined || highlightAtEpochMs === null
      ? undefined
      : points.find((point) => point.atEpochMs === highlightAtEpochMs);

  return (
    <figure className="m-0">
      <svg
        viewBox={`0 0 ${viewBoxWidth} ${viewBoxHeight}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`Best rate offered, from ${formatRate(first.basisPoints)} to ${formatRate(
          last.basisPoints,
        )} across ${points.length} offers.`}
        className={`h-16 w-full rounded-md border border-edge bg-surface-sunken ${tone}`}
      >
        <path
          d={commands.join(' ')}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          vectorEffect="non-scaling-stroke"
        />
        {highlighted === undefined ? null : (
          <circle
            cx={xOf(highlighted.atEpochMs)}
            cy={yOf(highlighted.basisPoints)}
            r={2.5}
            fill="currentColor"
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>
      <figcaption className="mt-2 flex justify-between font-mono text-xs text-ink-secondary">
        <span>{formatRate(first.basisPoints)}</span>
        <span>{formatRate(last.basisPoints)}</span>
      </figcaption>
    </figure>
  );
}
