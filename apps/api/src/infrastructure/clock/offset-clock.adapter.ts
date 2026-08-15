import { Injectable } from '@nestjs/common';
import type { ClockPort } from '../../domain/ports/clock.port';
import { Instant } from '../../domain/shared/instant';

/* The system clock plus an offset that only ever grows, so a test can jump a
   loan past maturity while time keeps flowing underneath. Freezing time
   instead would break every assertion that depends on real elapsed
   milliseconds, such as the minimum offer lifetime. */
@Injectable()
export class OffsetClockAdapter implements ClockPort {
  private offsetMilliseconds = 0n;

  now(): Instant {
    return Instant.fromEpochMilliseconds(BigInt(Date.now()) + this.offsetMilliseconds);
  }

  advanceBy(milliseconds: bigint): void {
    if (milliseconds < 0n) {
      throw new RangeError('The clock cannot move backwards');
    }
    this.offsetMilliseconds += milliseconds;
  }

  get offset(): bigint {
    return this.offsetMilliseconds;
  }
}
