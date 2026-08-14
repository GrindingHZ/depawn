import type { ReactElement } from 'react';

export interface MoneyValue {
  readonly minorUnits: string;
  readonly currency: string;
}

export interface MoneyProps {
  readonly value: MoneyValue;
}

const integerFormat = new Intl.NumberFormat('en-AU');

/* Formats straight from the API wire shape. Amounts never pass through a
   JavaScript number, so values beyond 2^53 minor units render exactly. */
export function formatMoney(value: MoneyValue): string {
  const total = BigInt(value.minorUnits);
  const isNegative = total < 0n;
  const magnitude = isNegative ? -total : total;
  const units = magnitude / 100n;
  const cents = magnitude % 100n;
  const sign = isNegative ? '-' : '';
  return `${value.currency} ${sign}${integerFormat.format(units)}.${cents.toString().padStart(2, '0')}`;
}

export function Money({ value }: MoneyProps): ReactElement {
  return <span className="font-mono text-ink-primary">{formatMoney(value)}</span>;
}
