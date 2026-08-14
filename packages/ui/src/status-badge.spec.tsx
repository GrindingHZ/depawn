import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StatusBadge } from './status-badge';

describe('StatusBadge', () => {
  it('always carries a text label alongside the tone', () => {
    render(<StatusBadge tone="danger" label="Defaulted" />);
    expect(screen.getByText('Defaulted')).toBeTruthy();
  });
});
