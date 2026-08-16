import { failure, ok } from '../shared/result';
import type { Result } from '../shared/result';
import { PhotographRejected } from './photograph-rejected';

export type PhotographContentType = 'image/jpeg' | 'image/png';

/* Eight megabytes. A phone photograph of a gold bar is comfortably under it,
   and anything above is either a mistake or someone filling our disk. */
export const maximumPhotographBytes = 8 * 1024 * 1024;

/* The bytes are what decides the type, never the file name and never the
   content type the client claimed. Both of those are attacker controlled, and
   this file is the reason an uploaded script cannot come back out of the
   media endpoint wearing an image's name.

   JPEG and PNG only. SVG is deliberately absent: it is a document that can
   carry script, so serving one from our own origin would hand an attacker a
   foothold on every page that displays it. */
const signatures: readonly { readonly type: PhotographContentType; readonly magic: number[] }[] = [
  { type: 'image/jpeg', magic: [0xff, 0xd8, 0xff] },
  { type: 'image/png', magic: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
];

export interface AcceptedPhotograph {
  readonly contentType: PhotographContentType;
  readonly byteLength: number;
}

export function acceptPhotograph(
  bytes: Uint8Array,
): Result<AcceptedPhotograph, PhotographRejected> {
  if (bytes.byteLength === 0) {
    return failure(new PhotographRejected('The file is empty.'));
  }
  if (bytes.byteLength > maximumPhotographBytes) {
    return failure(
      new PhotographRejected(
        `The file is larger than the ${maximumPhotographBytes / (1024 * 1024)} megabyte limit.`,
      ),
    );
  }

  const matched = signatures.find((signature) =>
    signature.magic.every((byte, index) => bytes[index] === byte),
  );
  if (matched === undefined) {
    return failure(new PhotographRejected('Only JPEG and PNG photographs are accepted.'));
  }
  return ok({ contentType: matched.type, byteLength: bytes.byteLength });
}
