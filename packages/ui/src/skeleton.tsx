import type { ReactElement } from 'react';

export interface SkeletonProps {
  readonly lineCount?: number;
}

/* Loading states are skeletons matching the final layout, never spinners
   (docs/05-frontend.md). */
export function Skeleton({ lineCount = 3 }: SkeletonProps): ReactElement {
  return (
    <div aria-hidden="true" data-testid="skeleton" className="flex flex-col gap-2">
      {Array.from({ length: lineCount }, (_unused, index) => (
        <div key={index} className="h-4 animate-pulse rounded-sm bg-surface-sunken" />
      ))}
    </div>
  );
}
