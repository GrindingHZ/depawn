import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Checkbox } from './checkbox';

describe('Checkbox', () => {
  it('associates the label with the checkbox', () => {
    render(<Checkbox label="Requires dual appraisal" />);
    expect(screen.getByRole('checkbox', { name: 'Requires dual appraisal' })).toBeTruthy();
  });
});
