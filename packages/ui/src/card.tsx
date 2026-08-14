import type { HTMLAttributes, ReactElement } from 'react';

export interface CardProps extends HTMLAttributes<HTMLElement> {
  readonly title?: string;
}

export function Card({ title, children, ...rest }: CardProps): ReactElement {
  return (
    <section
      {...rest}
      className="rounded-lg border border-edge bg-surface-raised p-4 text-ink-primary"
    >
      {title === undefined ? null : (
        <h2 className="mb-2 font-heading text-base font-semibold text-ink-primary">{title}</h2>
      )}
      {children}
    </section>
  );
}
