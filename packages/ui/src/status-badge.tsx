import type { ReactElement } from 'react';

export type StatusTone = 'neutral' | 'active' | 'success' | 'warning' | 'danger';

const classByTone: Record<StatusTone, string> = {
  neutral: 'text-status-neutral border-status-neutral',
  active: 'text-status-active border-status-active',
  success: 'text-status-success border-status-success',
  warning: 'text-status-warning border-status-warning',
  danger: 'text-status-danger border-status-danger',
};

export interface StatusBadgeProps {
  readonly tone: StatusTone;
  /* Colour is never the sole carrier of status; the label is required. */
  readonly label: string;
}

export function StatusBadge({ tone, label }: StatusBadgeProps): ReactElement {
  return (
    <span
      className={[
        'inline-flex items-center rounded-sm border px-2 py-0.5 font-body text-xs font-medium uppercase',
        classByTone[tone],
      ].join(' ')}
    >
      {label}
    </span>
  );
}
