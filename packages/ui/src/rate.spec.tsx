import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Rate, formatRate } from './rate';

describe('Rate', () => {
  it('formats basis points as an annual percentage', () => {
    expect(formatRate(1800)).toBe('18.00% p.a.');
    expect(formatRate(725)).toBe('7.25% p.a.');
    expect(formatRate(5)).toBe('0.05% p.a.');
  });

  it('renders from basis points', () => {
    render(<Rate basisPoints={1800} />);
    expect(screen.getByText('18.00% p.a.')).toBeTruthy();
  });
});
