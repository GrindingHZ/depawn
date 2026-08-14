import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Money, formatMoney } from './money';

describe('Money', () => {
  it('formats minor units with grouping and two decimals', () => {
    expect(formatMoney({ minorUnits: '250000', currency: 'AUD' })).toBe('AUD 2,500.00');
    expect(formatMoney({ minorUnits: '5', currency: 'AUD' })).toBe('AUD 0.05');
  });

  it('formats negative amounts', () => {
    expect(formatMoney({ minorUnits: '-9950', currency: 'AUD' })).toBe('AUD -99.50');
  });

  it('renders values beyond the safe integer range exactly', () => {
    expect(formatMoney({ minorUnits: '9007199254740993', currency: 'AUD' })).toBe(
      'AUD 90,071,992,547,409.93',
    );
  });

  it('renders as a span from the wire shape', () => {
    render(<Money value={{ minorUnits: '123456', currency: 'AUD' }} />);
    expect(screen.getByText('AUD 1,234.56')).toBeTruthy();
  });
});
