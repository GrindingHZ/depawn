import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ToastRegion } from './toast';

describe('ToastRegion', () => {
  it('announces messages through a polite live region', () => {
    const { container } = render(
      <ToastRegion messages={[{ id: '1', tone: 'success', text: 'The offer was placed.' }]} />,
    );
    const region = container.querySelector('[aria-live="polite"]');
    expect(region).not.toBeNull();
    expect(screen.getByText('The offer was placed.')).toBeTruthy();
  });
});
