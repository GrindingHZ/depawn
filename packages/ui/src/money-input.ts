/* Converts a decimal amount typed by a user into minor units without ever
   touching a float. Returns null when the input is not a plain positive
   amount. */
export function toMinorUnits(input: string): string | null {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(input.trim());
  if (match === null) {
    return null;
  }
  const units = match[1] ?? '0';
  const cents = (match[2] ?? '').padEnd(2, '0');
  const combined = `${units}${cents}`.replace(/^0+(?=\d)/, '');
  return combined === '0' ? null : combined;
}
