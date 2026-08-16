import { Global, Module } from '@nestjs/common';
import { isDemoMode, isTestMode } from '../../config/runtime-mode';
import { CLOCK_PORT } from '../../domain/ports/clock.port';
import { DemoClockAdapter } from './demo-clock.adapter';
import { OffsetClockAdapter } from './offset-clock.adapter';
import { SystemClockAdapter } from './system-clock.adapter';

/* Three clocks for three situations. A test suite gets an offset it holds in
   memory, because one process runs the whole suite and nothing should survive
   it. A demo gets an offset written down, because the seed moves time in one
   process and the api serves it from another. Everything else gets the system
   clock and no way to move it. */
function clockClassFor():
  typeof SystemClockAdapter | typeof OffsetClockAdapter | typeof DemoClockAdapter {
  if (isTestMode()) {
    return OffsetClockAdapter;
  }
  return isDemoMode() ? DemoClockAdapter : SystemClockAdapter;
}

const clockClass = clockClassFor();

@Global()
@Module({
  providers: [{ provide: CLOCK_PORT, useClass: clockClass }],
  exports: [CLOCK_PORT],
})
export class ClockModule {}
