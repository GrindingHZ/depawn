import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LoanToValue } from './loan-to-value';

describe('LoanToValue', () => {
  it('reads as a whole percent when it is one', () => {
    render(<LoanToValue basisPoints={2100} testId="ltv" />);
    expect(screen.getByTestId('ltv').textContent).toBe('21% LTV');
  });

  it('keeps a decimal only when it says something', () => {
    render(<LoanToValue basisPoints={2145} testId="ltv" />);
    expect(screen.getByTestId('ltv').textContent).toBe('21.5% LTV');
  });

  /* The bands are the point. A reader should be able to tell comfortable
     from stretched without doing the division themselves. */
  it.each([
    [1000, 'comfortable'],
    [3000, 'comfortable'],
    [3001, 'moderate'],
    [5000, 'moderate'],
    [5001, 'near the ceiling'],
    [6000, 'near the ceiling'],
  ])('describes %i basis points as %s', (basisPoints, expected) => {
    render(<LoanToValue basisPoints={basisPoints} testId="ltv" />);
    expect(screen.getByTestId('ltv').getAttribute('title')).toBe(`Loan to value: ${expected}`);
  });

  it('lines the digits up with the rows above and below', () => {
    render(<LoanToValue basisPoints={2100} testId="ltv" />);
    expect(screen.getByTestId('ltv').className).toContain('tabular-nums');
  });
});
