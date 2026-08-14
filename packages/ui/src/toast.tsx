import type { ReactElement } from 'react';
import type { StatusTone } from './status-badge';

export interface ToastMessage {
  readonly id: string;
  readonly tone: StatusTone;
  readonly text: string;
}

const borderByTone: Record<StatusTone, string> = {
  neutral: 'border-status-neutral',
  active: 'border-status-active',
  success: 'border-status-success',
  warning: 'border-status-warning',
  danger: 'border-status-danger',
};

export interface ToastRegionProps {
  readonly messages: readonly ToastMessage[];
}

export function ToastRegion({ messages }: ToastRegionProps): ReactElement {
  return (
    <div aria-live="polite" className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {messages.map((message) => (
        <p
          key={message.id}
          className={[
            'rounded-md border-l-4 bg-surface-raised px-4 py-3 font-body text-sm text-ink-primary',
            borderByTone[message.tone],
          ].join(' ')}
        >
          {message.text}
        </p>
      ))}
    </div>
  );
}
