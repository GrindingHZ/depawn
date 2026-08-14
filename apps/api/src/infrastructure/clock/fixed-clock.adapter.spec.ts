import { describe, expect, it } from 'vitest';
import { Instant } from '../../domain/shared/instant';
import { FixedClockAdapter } from './fixed-clock.adapter';

describe('FixedClockAdapter', () => {
  const start = Instant.fromEpochMilliseconds(1_700_000_000_000n);

  it('returns the instant it was fixed to', () => {
    const clock = new FixedClockAdapter(start);
    expect(clock.now().equals(start)).toBe(true);
  });

  it('advances to a later instant', () => {
    const clock = new FixedClockAdapter(start);
    const later = start.plusMilliseconds(86_400_000n);
    clock.advanceTo(later);
    expect(clock.now().equals(later)).toBe(true);
  });

  it('advances by a duration', () => {
    const clock = new FixedClockAdapter(start);
    clock.advanceBy(1000n);
    expect(clock.now().millisecondsSince(start)).toBe(1000n);
  });

  it('refuses to move backwards', () => {
    const clock = new FixedClockAdapter(start);
    expect(() => clock.advanceTo(start.plusMilliseconds(-1n))).toThrow(RangeError);
    expect(() => clock.advanceBy(-1n)).toThrow(RangeError);
  });
});
