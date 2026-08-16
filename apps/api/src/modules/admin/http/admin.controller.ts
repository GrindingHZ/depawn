import { Body, Controller, Get, Post, Query, UseInterceptors } from '@nestjs/common';
import { pauseSystemRequestSchema } from '@depawn/contracts';
import type { AuditPageResponse, PauseSystemRequest, SystemStateResponse } from '@depawn/contracts';
import type { Account } from '../../../domain/accounts/account';
import type { SystemState } from '../../../domain/ports/system-state.port';
import { CurrentAccount } from '../../shared/http/current-account.decorator';
import { IdempotencyInterceptor } from '../../shared/http/idempotency.interceptor';
import { Roles } from '../../shared/http/roles.decorator';
import { ZodValidationPipe } from '../../shared/http/zod-validation.pipe';
import { AuditSearchQuery } from '../application/audit-search.query';
import { PauseSystemUseCase } from '../application/pause-system.use-case';

function toSystemStateResponse(state: SystemState): SystemStateResponse {
  return {
    isPaused: state.isPaused,
    pausedAt:
      state.pausedAt === null
        ? null
        : new Date(Number(state.pausedAt.epochMilliseconds)).toISOString(),
    pausedByAccountId: state.pausedByAccountId,
    reason: state.reason,
  };
}

@Controller('admin')
export class AdminController {
  constructor(
    private readonly pauseSystem: PauseSystemUseCase,
    private readonly auditSearch: AuditSearchQuery,
  ) {}

  /* Readable by any signed in account, because a member who cannot place an
     offer deserves to be told the system is paused rather than guessing. */
  @Get('system-state')
  async readState(): Promise<SystemStateResponse> {
    return toSystemStateResponse(await this.pauseSystem.read());
  }

  @Roles('OPERATIONS')
  @Post('pause')
  @UseInterceptors(IdempotencyInterceptor)
  async pause(
    @CurrentAccount() account: Account,
    @Body(new ZodValidationPipe(pauseSystemRequestSchema)) body: PauseSystemRequest,
  ): Promise<SystemStateResponse> {
    const state = await this.pauseSystem.pause({
      requestedBy: account.id,
      reason: body.reason,
    });
    return toSystemStateResponse(state);
  }

  @Roles('OPERATIONS')
  @Post('unpause')
  @UseInterceptors(IdempotencyInterceptor)
  async unpause(@CurrentAccount() account: Account): Promise<SystemStateResponse> {
    return toSystemStateResponse(await this.pauseSystem.unpause(account.id));
  }

  @Roles('OPERATIONS')
  @Get('audit')
  async audit(
    @Query('subjectType') subjectType?: string,
    @Query('subjectId') subjectId?: string,
    @Query('actorId') actorId?: string,
    @Query('cursor') cursor?: string,
  ): Promise<AuditPageResponse> {
    const page = await this.auditSearch.search({
      ...(subjectType === undefined ? {} : { subjectType }),
      ...(subjectId === undefined ? {} : { subjectId }),
      ...(actorId === undefined ? {} : { actorId }),
      ...(cursor === undefined ? {} : { cursor }),
      limit: 25,
    });
    return {
      items: page.items.map((entry) => ({
        ...entry,
        before: entry.before ?? null,
        after: entry.after ?? null,
      })),
      nextCursor: page.nextCursor,
    };
  }
}
