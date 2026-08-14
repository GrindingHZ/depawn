import { useId } from 'react';
import type { ReactElement, SelectHTMLAttributes } from 'react';

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  readonly label: string;
  readonly errorMessage?: string | undefined;
}

export function Select({ label, errorMessage, id, children, ...rest }: SelectProps): ReactElement {
  const generatedId = useId();
  const selectId = id ?? generatedId;
  const hasError = errorMessage !== undefined && errorMessage !== '';

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={selectId} className="font-body text-sm text-ink-secondary">
        {label}
      </label>
      <select
        id={selectId}
        aria-invalid={hasError}
        {...rest}
        className={[
          'min-h-row cursor-pointer rounded-md border bg-surface-raised px-3 font-body text-sm text-ink-primary',
          'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-status-active',
          hasError ? 'border-status-danger' : 'border-edge',
        ].join(' ')}
      >
        {children}
      </select>
      {hasError ? (
        <p role="alert" className="font-body text-sm text-status-danger">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}
