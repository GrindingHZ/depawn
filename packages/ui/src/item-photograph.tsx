import { useState } from 'react';
import type { ReactElement } from 'react';

export interface ItemPhotographProps {
  readonly src: string | null;
  readonly alt: string;
  readonly size?: 'thumbnail' | 'detail';
  readonly testId?: string;
}

const boxBySize = {
  thumbnail: 'h-14 w-14 rounded-md',
  detail: 'h-40 w-40 rounded-lg',
} as const;

/* The item, or a placeholder that holds its space. The space is reserved
   either way: a row that grows a photograph after the fact shifts everything
   under it, and a marketplace that jumps while you are reading it does not
   feel like somewhere to leave money.

   A photograph that fails to load falls back to the placeholder rather than a
   broken image icon, because the media endpoint answers not found for an item
   the viewer is not entitled to see, and that is a normal answer. */
export function ItemPhotograph({
  src,
  alt,
  size = 'thumbnail',
  testId,
}: ItemPhotographProps): ReactElement {
  const [hasFailed, setHasFailed] = useState(false);
  const box = boxBySize[size];

  if (src === null || hasFailed) {
    return (
      <div
        data-testid={testId}
        aria-hidden="true"
        className={`${box} shrink-0 border border-edge bg-surface-sunken`}
      />
    );
  }

  return (
    <img
      data-testid={testId}
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      onError={() => setHasFailed(true)}
      className={`${box} shrink-0 border border-edge bg-surface-sunken object-cover`}
    />
  );
}
