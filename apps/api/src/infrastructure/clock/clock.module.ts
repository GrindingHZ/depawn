import { Global, Module } from '@nestjs/common';
import { CLOCK_PORT } from '../../domain/ports/clock.port';
import { OffsetClockAdapter } from './offset-clock.adapter';
import { SystemClockAdapter } from './system-clock.adapter';

/* Under test the process runs an advanceable clock so a Playwright run can
   push a loan past maturity; everywhere else the system clock is the only
   source of time. */
const clockClass = process.env.NODE_ENV === 'test' ? OffsetClockAdapter : SystemClockAdapter;

@Global()
@Module({
  providers: [{ provide: CLOCK_PORT, useClass: clockClass }],
  exports: [CLOCK_PORT],
})
export class ClockModule {}
