import type { ClockPort } from '../../domain/ports/clock.port';
import { Instant } from '../../domain/shared/instant';

export class SystemClockAdapter implements ClockPort {
  now(): Instant {
    return Instant.fromEpochMilliseconds(BigInt(Date.now()));
  }
}
