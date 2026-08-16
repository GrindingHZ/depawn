import type { ReactElement } from 'react';

export interface LoanToValueProps {
  readonly basisPoints: number;
  readonly testId?: string;
}

/* Banded rather than a bare number, because the reader's question is not
   "what is the ratio" but "is this comfortable". The bands are about how much
   room is left before the security stops covering the loan, and they are
   deliberately coarse: three states someone can read at a glance beats a
   gradient nobody can interpret. */
function toneFor(basisPoints: number): { label: string; className: string } {
  if (basisPoints <= 3000) {
    return { label: 'comfortable', className: 'bg-surface-sunken text-status-success' };
  }
  if (basisPoints <= 5000) {
    return { label: 'moderate', className: 'bg-surface-sunken text-status-active' };
  }
  return { label: 'near the ceiling', className: 'bg-surface-sunken text-status-warning' };
}

export function LoanToValue({ basisPoints, testId }: LoanToValueProps): ReactElement {
  const tone = toneFor(basisPoints);
  /* Integer arithmetic all the way to the string. `(2145 / 100).toFixed(1)`
     answers 21.4, because 21.45 is not representable and lands just below it.
     Rounding tenths as integers cannot drift, which matters here for the same
     reason it matters in the ledger. */
  const tenths = Math.round(basisPoints / 10);
  const whole = Math.trunc(tenths / 10);
  const percent = tenths % 10 === 0 ? `${whole}` : `${whole}.${tenths % 10}`;

  return (
    <span
      data-testid={testId}
      title={`Loan to value: ${tone.label}`}
      className={[
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5',
        'font-mono text-xs tabular-nums',
        tone.className,
      ].join(' ')}
    >
      {percent}% LTV
    </span>
  );
}
