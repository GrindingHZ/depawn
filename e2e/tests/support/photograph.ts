/* A real, structurally valid PNG. Intake verifies uploaded bytes rather than
   trusting the file name, so a spec cannot attach a string called front.jpg
   any more and should not want to: an upload path that only ever sees fake
   bytes in testing is an upload path nobody has actually exercised. */
const eightBySquare =
  'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEUlEQVR4nGM4OVMfK2IYWhIAUpFkQe1x0QsAAAAASUVORK5CYII=';

export function photographBytes(): Buffer {
  return Buffer.from(eightBySquare, 'base64');
}
