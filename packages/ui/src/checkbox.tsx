import { useId } from 'react';
import type { InputHTMLAttributes, ReactElement } from 'react';

export interface CheckboxProps extends InputHTMLAttributes<HTMLInputElement> {
  readonly label: string;
}

export function Checkbox({ label, id, ...rest }: CheckboxProps): ReactElement {
  const generatedId = useId();
  const inputId = id ?? generatedId;

  return (
    <div className="flex items-center gap-2">
      <input
        id={inputId}
        type="checkbox"
        {...rest}
        className="size-4 cursor-pointer rounded-sm border-edge-strong accent-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-status-active"
      />
      <label htmlFor={inputId} className="cursor-pointer font-body text-sm text-ink-primary">
        {label}
      </label>
    </div>
  );
}
