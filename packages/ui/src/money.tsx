import type { ReactElement } from 'react';

export interface MoneyValue {
  readonly minorUnits: string;
  readonly currency: string;
}

export interface MoneyProps {
  readonly value: MoneyValue;
  /* Override the reader's own locale. Only for tests and for a screen that
     deliberately shows a figure the way another market would. */
  readonly locale?: string;
}

/* How many minor units make one major unit is a property of the currency, not
   a constant. Most have two decimal places; the yen has none and the dinar
   has three. Asking Intl rather than assuming is the difference between
   working in a second market and quietly showing hundredths of a yen. */
const exponentCache = new Map<string, number>();

function minorUnitExponentFor(currency: string): number {
  const cached = exponentCache.get(currency);
  if (cached !== undefined) {
    return cached;
  }
  let exponent = 2;
  try {
    const resolved = new Intl.NumberFormat('en', {
      style: 'currency',
      currency,
    }).resolvedOptions();
    exponent = resolved.maximumFractionDigits ?? 2;
  } catch {
    // Not a currency Intl knows. Two decimal places is the common case and a
    // wrong separator is better than throwing on a screen full of figures.
  }
  exponentCache.set(currency, exponent);
  return exponent;
}

const groupingCache = new Map<string, Intl.NumberFormat>();

function groupingFor(locale: string): Intl.NumberFormat {
  const cached = groupingCache.get(locale);
  if (cached !== undefined) {
    return cached;
  }
  const format = new Intl.NumberFormat(locale, { useGrouping: true, maximumFractionDigits: 0 });
  groupingCache.set(locale, format);
  return format;
}

function readerLocale(): string {
  return typeof navigator === 'undefined' ? 'en-AU' : navigator.language;
}

/* Formats straight from the API wire shape. The split into major and minor
   units is bigint arithmetic, so an amount beyond 2^53 minor units renders
   exactly; only the grouping of the whole part goes through Intl, which
   cannot lose precision because it is handed a string.

   The currency code leads rather than a symbol. A marketplace that will one
   day quote in more than one currency should never make a reader guess which
   dollar they are looking at. */
export function formatMoney(value: MoneyValue, locale = readerLocale()): string {
  const exponent = minorUnitExponentFor(value.currency);
  const divisor = 10n ** BigInt(exponent);
  const total = BigInt(value.minorUnits);
  const isNegative = total < 0n;
  const magnitude = isNegative ? -total : total;
  const units = magnitude / divisor;
  const sign = isNegative ? '-' : '';
  const whole = `${sign}${groupingFor(locale).format(units)}`;

  if (exponent === 0) {
    return `${value.currency} ${whole}`;
  }
  const fraction = (magnitude % divisor).toString().padStart(exponent, '0');
  const separator = decimalSeparatorFor(locale);
  return `${value.currency} ${whole}${separator}${fraction}`;
}

const separatorCache = new Map<string, string>();

function decimalSeparatorFor(locale: string): string {
  const cached = separatorCache.get(locale);
  if (cached !== undefined) {
    return cached;
  }
  const separator =
    new Intl.NumberFormat(locale).formatToParts(1.1).find((part) => part.type === 'decimal')
      ?.value ?? '.';
  separatorCache.set(locale, separator);
  return separator;
}

export function Money({ value, locale }: MoneyProps): ReactElement {
  return (
    <span className="font-mono tabular-nums text-ink-primary">{formatMoney(value, locale)}</span>
  );
}
