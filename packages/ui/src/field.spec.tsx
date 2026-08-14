import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Field } from './field';

describe('Field', () => {
  it('associates the label with the input', () => {
    render(<Field label="Email" type="email" />);
    expect(screen.getByLabelText('Email')).toBeTruthy();
  });

  it('announces an error and marks the input invalid', () => {
    render(<Field label="Email" errorMessage="Enter a valid email address." />);
    expect(screen.getByRole('alert').textContent).toBe('Enter a valid email address.');
    expect(screen.getByLabelText('Email').getAttribute('aria-invalid')).toBe('true');
  });
});
