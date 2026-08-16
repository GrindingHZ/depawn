import { Global, Module } from '@nestjs/common';
import { hasAdvanceableClock } from '../../config/runtime-mode';
import { CLOCK_PORT } from '../../domain/ports/clock.port';
import { OffsetClockAdapter } from './offset-clock.adapter';
import { SystemClockAdapter } from './system-clock.adapter';

/* Under test and in a demo the process runs an advanceable clock so a run can
   push a loan past maturity; everywhere else the system clock is the only
   source of time. */
const clockClass = hasAdvanceableClock() ? OffsetClockAdapter : SystemClockAdapter;

@Global()
@Module({
  providers: [{ provide: CLOCK_PORT, useClass: clockClass }],
  exports: [CLOCK_PORT],
})
export class ClockModule {}
