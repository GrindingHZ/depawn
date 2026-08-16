import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Money, formatMoney } from './money';

describe('Money', () => {
  it('formats minor units with grouping and two decimals', () => {
    expect(formatMoney({ minorUnits: '250000', currency: 'AUD' }, 'en-AU')).toBe('AUD 2,500.00');
    expect(formatMoney({ minorUnits: '5', currency: 'AUD' }, 'en-AU')).toBe('AUD 0.05');
  });

  it('formats negative amounts', () => {
    expect(formatMoney({ minorUnits: '-9950', currency: 'AUD' }, 'en-AU')).toBe('AUD -99.50');
  });

  it('renders values beyond the safe integer range exactly', () => {
    expect(formatMoney({ minorUnits: '9007199254740993', currency: 'AUD' }, 'en-AU')).toBe(
      'AUD 90,071,992,547,409.93',
    );
  });

  it('renders as a span from the wire shape', () => {
    render(<Money value={{ minorUnits: '123456', currency: 'AUD' }} />);
    expect(screen.getByText('AUD 1,234.56')).toBeTruthy();
  });

  /* How many minor units make a major one is a property of the currency. The
     yen has none, so a hundred minor units is a hundred yen, not one. */
  it('respects the currency, not a two decimal assumption', () => {
    expect(formatMoney({ minorUnits: '250000', currency: 'JPY' }, 'en-AU')).toBe('JPY 250,000');
    expect(formatMoney({ minorUnits: '250000', currency: 'KWD' }, 'en-AU')).toBe('KWD 250.000');
  });

  it('groups and separates the way the reader does', () => {
    expect(formatMoney({ minorUnits: '123456789', currency: 'EUR' }, 'de-DE')).toBe(
      'EUR 1.234.567,89',
    );
    expect(formatMoney({ minorUnits: '123456789', currency: 'EUR' }, 'en-AU')).toBe(
      'EUR 1,234,567.89',
    );
  });

  /* A currency Intl has never heard of is still money somebody is owed, so
     it renders rather than throwing a screen of figures away. */
  it('falls back rather than failing on an unknown currency', () => {
    expect(formatMoney({ minorUnits: '250000', currency: 'ZZZ' }, 'en-AU')).toBe('ZZZ 2,500.00');
  });

  it('keeps the exactness at scale in a currency with three decimals', () => {
    expect(formatMoney({ minorUnits: '9007199254740993', currency: 'KWD' }, 'en-AU')).toBe(
      'KWD 9,007,199,254,740.993',
    );
  });
});
