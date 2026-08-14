import type { ButtonHTMLAttributes, ReactElement } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'danger';

const classByVariant: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-ink-inverse hover:bg-accent-hover',
  secondary: 'border border-edge bg-surface-raised text-ink-primary hover:bg-surface-sunken',
  danger: 'bg-status-danger text-ink-inverse hover:opacity-90',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly variant?: ButtonVariant;
}

export function Button({
  variant = 'primary',
  type = 'button',
  ...rest
}: ButtonProps): ReactElement {
  return (
    <button
      type={type}
      {...rest}
      className={[
        'inline-flex min-h-row cursor-pointer items-center justify-center rounded-md px-4',
        'font-body text-sm font-medium transition-colors duration-150',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-status-active',
        'disabled:cursor-not-allowed disabled:opacity-50',
        classByVariant[variant],
      ].join(' ')}
    />
  );
}
