import type { ReactElement, ReactNode } from 'react';
import { Button } from './button';

export interface DialogProps {
  readonly title: string;
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly children: ReactNode;
}

export function Dialog({ title, isOpen, onClose, children }: DialogProps): ReactElement | null {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-primary/50 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="w-full max-w-md rounded-lg border border-edge bg-surface-raised p-6"
      >
        <h2 className="mb-4 font-heading text-lg font-semibold text-ink-primary">{title}</h2>
        <div className="mb-4">{children}</div>
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
      </div>
    </div>
  );
}
