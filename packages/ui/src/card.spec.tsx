import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Card } from './card';

describe('Card', () => {
  it('renders a heading and content', () => {
    render(
      <Card title="Loan detail">
        <p>Principal</p>
      </Card>,
    );
    expect(screen.getByRole('heading', { name: 'Loan detail' })).toBeTruthy();
    expect(screen.getByText('Principal')).toBeTruthy();
  });
});
