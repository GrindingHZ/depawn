import { Controller, Get } from '@nestjs/common';
import { hasAdvanceableClock } from '../../../config/runtime-mode';
import { Public } from '../../shared/http/public.decorator';

export interface HealthResponse {
  readonly status: 'ok';
  /* The admin screen hides the clock control unless the process it is
     talking to actually has a clock it can move, so the answer has to come
     from the process rather than from the browser's own build flags. */
  readonly demoMode: boolean;
}

@Controller('health')
export class HealthController {
  @Public()
  @Get()
  read(): HealthResponse {
    return { status: 'ok', demoMode: hasAdvanceableClock() };
  }
}
