import { useId } from 'react';
import type { InputHTMLAttributes, ReactElement } from 'react';

export interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  readonly label: string;
  readonly errorMessage?: string;
}

export function Field({ label, errorMessage, id, ...rest }: FieldProps): ReactElement {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const hasError = errorMessage !== undefined && errorMessage !== '';

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={inputId} className="font-body text-sm text-ink-secondary">
        {label}
      </label>
      <input
        id={inputId}
        aria-invalid={hasError}
        {...rest}
        className={[
          'min-h-row rounded-md border bg-surface-raised px-3 font-body text-sm text-ink-primary',
          'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-status-active',
          hasError ? 'border-status-danger' : 'border-edge',
        ].join(' ')}
      />
      {hasError ? (
        <p role="alert" className="font-body text-sm text-status-danger">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}
