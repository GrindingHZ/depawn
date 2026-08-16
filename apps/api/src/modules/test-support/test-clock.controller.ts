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
   only when the process has a clock it can move: under test, or in a demo.
   A deployed process has neither, so this route is absent from the graph
   rather than present and refusing (docs/06-testing.md). */
@Controller('test/clock')
export class TestClockController {
  constructor(@Inject(CLOCK_PORT) private readonly clock: ClockPort) {}

  @Public()
  @Post('advance')
  async advance(
    @Body(new ZodValidationPipe(advanceClockRequestSchema)) body: AdvanceClockRequest,
  ): Promise<AdvanceClockResponse> {
    if (!isAdvanceable(this.clock)) {
      throw new NotFoundException();
    }
    await this.clock.advanceBy(BigInt(body.milliseconds));
    return { now: new Date(Number(this.clock.now().epochMilliseconds)).toISOString() };
  }

  /* One process serves every spec, so a suite that moved the clock must put
     it back or the next spec is born in the future. */
  @Public()
  @Post('reset')
  async reset(): Promise<AdvanceClockResponse> {
    if (!isAdvanceable(this.clock)) {
      throw new NotFoundException();
    }
    await this.clock.reset();
    return { now: new Date(Number(this.clock.now().epochMilliseconds)).toISOString() };
  }
}
