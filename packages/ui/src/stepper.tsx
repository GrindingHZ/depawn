import type { ReactElement } from 'react';

export interface StepperProps {
  readonly steps: readonly string[];
  readonly currentIndex: number;
}

export function Stepper({ steps, currentIndex }: StepperProps): ReactElement {
  return (
    <ol className="flex flex-wrap gap-4">
      {steps.map((step, index) => {
        const state = index < currentIndex ? 'done' : index === currentIndex ? 'current' : 'ahead';
        return (
          <li
            key={step}
            aria-current={state === 'current' ? 'step' : undefined}
            className={[
              'flex min-h-row items-center gap-2 font-body text-sm',
              state === 'current' ? 'font-semibold text-ink-primary' : 'text-ink-secondary',
            ].join(' ')}
          >
            <span
              className={[
                'flex size-6 items-center justify-center rounded-lg border text-xs',
                state === 'done' ? 'border-status-success text-status-success' : '',
                state === 'current' ? 'border-status-active text-status-active' : '',
                state === 'ahead' ? 'border-edge text-ink-secondary' : '',
              ].join(' ')}
            >
              {index + 1}
            </span>
            {step}
          </li>
        );
      })}
    </ol>
  );
}
