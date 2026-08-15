import { Body, Controller, Inject, NotFoundException, Post } from '@nestjs/common';
import { z } from 'zod';
import { CLOCK_PORT } from '../../domain/ports/clock.port';
import type { ClockPort } from '../../domain/ports/clock.port';
import { isAdvanceable } from '../../infrastructure/clock/advanceable-clock';
import { Public } from '../shared/http/public.decorator';
import { ZodValidationPipe } from '../shared/http/zod-validation.pipe';

const advanceClockRequestSchema = z.object({
  milliseconds: z.number().int().positive(),
});

type AdvanceClockRequest = z.infer<typeof advanceClockRequestSchema>;

export interface AdvanceClockResponse {
  readonly now: string;
}

/* Mounted only by TestSupportModule, which the application graph imports
   only under NODE_ENV=test, so this route cannot exist in a deployed
   process (docs/06-testing.md). */
@Controller('test/clock')
export class TestClockController {
  constructor(@Inject(CLOCK_PORT) private readonly clock: ClockPort) {}

  @Public()
  @Post('advance')
  advance(
    @Body(new ZodValidationPipe(advanceClockRequestSchema)) body: AdvanceClockRequest,
  ): AdvanceClockResponse {
    if (!isAdvanceable(this.clock)) {
      throw new NotFoundException();
    }
    this.clock.advanceBy(BigInt(body.milliseconds));
    return { now: new Date(Number(this.clock.now().epochMilliseconds)).toISOString() };
  }

  /* One process serves every spec, so a suite that moved the clock must put
     it back or the next spec is born in the future. */
  @Public()
  @Post('reset')
  reset(): AdvanceClockResponse {
    if (!isAdvanceable(this.clock)) {
      throw new NotFoundException();
    }
    this.clock.reset();
    return { now: new Date(Number(this.clock.now().epochMilliseconds)).toISOString() };
  }
}
