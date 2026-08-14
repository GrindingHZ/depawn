import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Stepper } from './stepper';

describe('Stepper', () => {
  it('marks only the current step', () => {
    render(<Stepper steps={['Identify', 'Appraise', 'Seal']} currentIndex={1} />);
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(3);
    expect(items[1]?.getAttribute('aria-current')).toBe('step');
    expect(items[0]?.getAttribute('aria-current')).toBeNull();
    expect(items[2]?.getAttribute('aria-current')).toBeNull();
  });
});
