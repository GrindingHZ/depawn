import type { ReactElement } from 'react';

export interface RateProps {
  readonly basisPoints: number;
}

export function formatRate(basisPoints: number): string {
  const sign = basisPoints < 0 ? '-' : '';
  const magnitude = Math.abs(basisPoints);
  const whole = Math.trunc(magnitude / 100);
  const fraction = magnitude % 100;
  return `${sign}${whole}.${fraction.toString().padStart(2, '0')}% p.a.`;
}

export function Rate({ basisPoints }: RateProps): ReactElement {
  return <span className="font-mono text-ink-primary">{formatRate(basisPoints)}</span>;
}
