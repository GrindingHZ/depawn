import { Global, Module } from '@nestjs/common';
import { CLOCK_PORT } from '../../domain/ports/clock.port';
import { SystemClockAdapter } from './system-clock.adapter';

@Global()
@Module({
  providers: [{ provide: CLOCK_PORT, useClass: SystemClockAdapter }],
  exports: [CLOCK_PORT],
})
export class ClockModule {}
