import { describe, expect, it } from 'vitest';
import { SystemClockAdapter } from './system-clock.adapter';

describe('SystemClockAdapter', () => {
  it('reads the ambient time as epoch milliseconds', () => {
    const before = BigInt(Date.now());
    const now = new SystemClockAdapter().now();
    const after = BigInt(Date.now());
    expect(now.epochMilliseconds >= before).toBe(true);
    expect(now.epochMilliseconds <= after).toBe(true);
  });
});
