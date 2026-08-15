import type { ClockPort } from '../../domain/ports/clock.port';
import { Instant } from '../../domain/shared/instant';

/* Deterministic clock for tests. Time only moves forward; a test that needs
   to go backwards is asserting on a state that could never occur. */
export class FixedClockAdapter implements ClockPort {
  private current: Instant;

  constructor(private readonly start: Instant) {
    this.current = start;
  }

  reset(): void {
    this.current = this.start;
  }

  now(): Instant {
    return this.current;
  }

  advanceTo(instant: Instant): void {
    if (instant.isBefore(this.current)) {
      throw new RangeError('The fixed clock cannot move backwards');
    }
    this.current = instant;
  }

  advanceBy(milliseconds: bigint): void {
    if (milliseconds < 0n) {
      throw new RangeError('The fixed clock cannot move backwards');
    }
    this.current = this.current.plusMilliseconds(milliseconds);
  }
}
