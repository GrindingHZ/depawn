import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Skeleton } from './skeleton';

describe('Skeleton', () => {
  it('renders the requested line count and hides from assistive tech', () => {
    render(<Skeleton lineCount={4} />);
    const skeleton = screen.getByTestId('skeleton');
    expect(skeleton.children).toHaveLength(4);
    expect(skeleton.getAttribute('aria-hidden')).toBe('true');
  });
});
