import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EmptyState } from './empty-state';

describe('EmptyState', () => {
  it('renders title description and action', () => {
    render(
      <EmptyState
        title="No listings yet"
        description="List a receipt to request a loan."
        action={<a href="/borrow/receipts">View receipts</a>}
      />,
    );
    expect(screen.getByText('No listings yet')).toBeTruthy();
    expect(screen.getByText('List a receipt to request a loan.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'View receipts' })).toBeTruthy();
  });
});
