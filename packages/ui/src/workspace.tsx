import type { ReactElement, ReactNode } from 'react';

export interface WorkspaceProps {
  readonly indexStrip?: ReactNode;
  readonly browse: ReactNode;
  readonly detail: ReactNode;
  readonly spine?: ReactNode;
  readonly tape?: ReactNode;
}

/* Two panes, collateral on the left and the market on the right, with the
   index above and the spine and tape below.

   Below the large breakpoint the panes stack rather than shrink: two columns
   of a dense book on a narrow screen is two columns of nothing legible. The
   workspace is a desktop instrument and says so by degrading to a single
   column rather than by pretending. */
export function Workspace({
  indexStrip,
  browse,
  detail,
  spine,
  tape,
}: WorkspaceProps): ReactElement {
  return (
    <div className="flex h-full min-h-0 flex-col bg-surface-base">
      {indexStrip}
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <section
          aria-label="Live listings"
          className="flex min-h-0 shrink-0 flex-col overflow-y-auto border-edge lg:w-[44%] lg:border-r"
        >
          {browse}
        </section>
        <section aria-label="Selected listing" className="min-h-0 flex-1 overflow-y-auto">
          {detail}
        </section>
      </div>
      {spine}
      {tape}
    </div>
  );
}

export interface WorkspaceEmptyProps {
  readonly title: string;
  readonly description: string;
}

/* The detail pane with nothing selected. A prompt rather than a spinner:
   nothing is loading, the reader simply has not chosen yet, and a spinner
   would claim otherwise. */
export function WorkspacePrompt({ title, description }: WorkspaceEmptyProps): ReactElement {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
      <p className="font-heading text-base font-semibold text-ink-primary">{title}</p>
      <p className="max-w-md font-body text-sm text-ink-secondary">{description}</p>
    </div>
  );
}
