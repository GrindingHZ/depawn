import { describe, expect, it } from 'vitest';
import { OffsetClockAdapter } from './offset-clock.adapter';

describe('OffsetClockAdapter', () => {
  it('tracks the system clock before any advance', () => {
    const clock = new OffsetClockAdapter();
    const before = BigInt(Date.now());
    const reading = clock.now().epochMilliseconds;
    const after = BigInt(Date.now());
    expect(reading).toBeGreaterThanOrEqual(before);
    expect(reading).toBeLessThanOrEqual(after);
  });

  it('carries the advance into every later reading', () => {
    const clock = new OffsetClockAdapter();
    const oneDay = 24n * 60n * 60n * 1000n;
    const before = clock.now();

    clock.advanceBy(oneDay);
    expect(clock.now().millisecondsSince(before)).toBeGreaterThanOrEqual(oneDay);
    expect(clock.offset).toBe(oneDay);

    clock.advanceBy(oneDay);
    expect(clock.offset).toBe(2n * oneDay);
  });

  it('refuses to move backwards', () => {
    const clock = new OffsetClockAdapter();
    expect(() => clock.advanceBy(-1n)).toThrow(RangeError);
  });
});
