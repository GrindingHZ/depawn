import { Controller, Get, Inject } from '@nestjs/common';
import { CLOCK_PORT } from '../../../domain/ports/clock.port';
import type { ClockPort } from '../../../domain/ports/clock.port';
import { hasAdvanceableClock } from '../../../config/runtime-mode';
import { Public } from '../../shared/http/public.decorator';

export interface HealthResponse {
  readonly status: 'ok';
  /* What this process thinks the time is. A demo runs weeks ahead of the wall
     clock, and anything that expected real time would misread every deadline
     in the system, so the process says so rather than leaving it to be
     discovered. */
  readonly now: string;
  /* The admin screen hides the clock control unless the process it is
     talking to actually has a clock it can move, so the answer has to come
     from the process rather than from the browser's own build flags. */
  readonly demoMode: boolean;
}

@Controller('health')
export class HealthController {
  constructor(@Inject(CLOCK_PORT) private readonly clock: ClockPort) {}

  @Public()
  @Get()
  read(): HealthResponse {
    return {
      status: 'ok',
      now: new Date(Number(this.clock.now().epochMilliseconds)).toISOString(),
      demoMode: hasAdvanceableClock(),
    };
  }
}
