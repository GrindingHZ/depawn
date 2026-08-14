import type { ReactElement } from 'react';

export interface RateProps {
  readonly basisPoints: number;
}

export function formatRate(basisPoints: number): string {
  const whole = Math.trunc(basisPoints / 100);
  const fraction = Math.abs(basisPoints % 100);
  return `${whole}.${fraction.toString().padStart(2, '0')}% p.a.`;
}

export function Rate({ basisPoints }: RateProps): ReactElement {
  return <span className="font-mono text-ink-primary">{formatRate(basisPoints)}</span>;
}
