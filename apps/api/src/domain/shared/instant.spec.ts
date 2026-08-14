import { describe, expect, it } from 'vitest';
import { Instant } from './instant';

describe('Instant', () => {
  const start = Instant.fromEpochMilliseconds(1_700_000_000_000n);

  it('adds milliseconds', () => {
    const later = start.plusMilliseconds(86_400_000n);
    expect(later.epochMilliseconds).toBe(1_700_086_400_000n);
  });

  it('computes elapsed milliseconds since another instant', () => {
    const later = start.plusMilliseconds(1000n);
    expect(later.millisecondsSince(start)).toBe(1000n);
    expect(start.millisecondsSince(later)).toBe(-1000n);
  });

  it('orders instants', () => {
    const later = start.plusMilliseconds(1n);
    expect(later.isAfter(start)).toBe(true);
    expect(start.isBefore(later)).toBe(true);
    expect(start.isAfter(later)).toBe(false);
    expect(start.equals(Instant.fromEpochMilliseconds(1_700_000_000_000n))).toBe(true);
  });
});
