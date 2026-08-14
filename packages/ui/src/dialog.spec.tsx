import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Dialog } from './dialog';

describe('Dialog', () => {
  it('renders nothing while closed', () => {
    render(
      <Dialog title="Confirm seal" isOpen={false} onClose={() => undefined}>
        <p>Sealing is irreversible.</p>
      </Dialog>,
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('renders a modal dialog and closes', () => {
    const onClose = vi.fn();
    render(
      <Dialog title="Confirm seal" isOpen onClose={onClose}>
        <p>Sealing is irreversible.</p>
      </Dialog>,
    );
    expect(screen.getByRole('dialog', { name: 'Confirm seal' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
