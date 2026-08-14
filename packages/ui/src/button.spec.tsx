import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Button } from './button';

describe('Button', () => {
  it('defaults to type button so forms do not submit by accident', () => {
    render(<Button>Place offer</Button>);
    expect(screen.getByRole('button', { name: 'Place offer' }).getAttribute('type')).toBe('button');
  });

  it('keeps an explicit submit type', () => {
    render(<Button type="submit">Log in</Button>);
    expect(screen.getByRole('button', { name: 'Log in' }).getAttribute('type')).toBe('submit');
  });

  it('renders disabled', () => {
    render(<Button disabled>Repay</Button>);
    expect(screen.getByRole('button', { name: 'Repay' }).hasAttribute('disabled')).toBe(true);
  });
});
