import type { ClockPort } from '../../domain/ports/clock.port';

/* Test clocks can be pushed forward; the system clock cannot. The test only
   endpoint narrows through this rather than depending on one adapter, so it
   works against the offset clock the api process runs and against the fixed
   clock the integration harness injects. */
export interface AdvanceableClock extends ClockPort {
  advanceBy(milliseconds: bigint): void;
  reset(): void;
}

export function isAdvanceable(clock: ClockPort): clock is AdvanceableClock {
  const candidate: ClockPort & { advanceBy?: unknown } = clock;
  return typeof candidate.advanceBy === 'function';
}
