import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Select } from './select';

describe('Select', () => {
  it('associates the label and renders options', () => {
    render(
      <Select label="Category" defaultValue="BULLION">
        <option value="BULLION">Bullion</option>
      </Select>,
    );
    const select = screen.getByLabelText('Category');
    expect(select).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Bullion' })).toBeTruthy();
  });

  it('announces an error', () => {
    render(
      <Select label="Category" errorMessage="Choose a category.">
        <option>Bullion</option>
      </Select>,
    );
    expect(screen.getByRole('alert').textContent).toBe('Choose a category.');
  });
});
