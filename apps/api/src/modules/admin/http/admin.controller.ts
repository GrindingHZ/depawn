import { Body, Controller, Get, Post, Put, Query, UseInterceptors } from '@nestjs/common';
import {
  pauseSystemRequestSchema,
  reconcileRequestSchema,
  updateParametersRequestSchema,
} from '@depawn/contracts';
import type {
  AuditPageResponse,
  DeadLettersResponse,
  RequestMetricsResponse,
  ExposureByVaultResponse,
  LoanBookResponse,
  PauseSystemRequest,
  ReconcileRequest,
  LatestReconciliationResponse,
  ReconciliationRunResponse,
  ProtocolParametersResponse,
  SystemStateResponse,
  UpdateParametersRequest,
} from '@depawn/contracts';
import type { Account } from '../../../domain/accounts/account';
import type { SystemState } from '../../../domain/ports/system-state.port';
import { receiptIdOf, vaultIdOf } from '../../../domain/shared/identifiers';
import { toMoneyDto } from '../../shared/http/money.mapper';
import { CurrentAccount } from '../../shared/http/current-account.decorator';
import { IdempotencyInterceptor } from '../../shared/http/idempotency.interceptor';
import { RequestMetrics } from '../../shared/http/request-metrics';
import { Roles } from '../../shared/http/roles.decorator';
import { ZodValidationPipe } from '../../shared/http/zod-validation.pipe';
import { Instant } from '../../../domain/shared/instant';
import { fromParametersDto, toParametersDto } from './parameters.mapper';
import { AuditSearchQuery } from '../application/audit-search.query';
import { DeadLetterQuery } from '../application/dead-letter.query';
import { LoanBookQuery } from '../application/loan-book.query';
import { ReconcileVaultUseCase } from '../application/reconcile-vault.use-case';
import { ReconciliationHistoryQuery } from '../application/reconciliation-history.query';
import { PauseSystemUseCase } from '../application/pause-system.use-case';
import { UpdateProtocolParametersUseCase } from '../application/update-protocol-parameters.use-case';
import type { ProtocolParametersView } from '../application/update-protocol-parameters.use-case';

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
    private readonly reconcileVault: ReconcileVaultUseCase,
    private readonly reconciliationHistory: ReconciliationHistoryQuery,
    private readonly loanBook: LoanBookQuery,
    private readonly protocolParameters: UpdateProtocolParametersUseCase,
    private readonly deadLetters: DeadLetterQuery,
    private readonly requestMetrics: RequestMetrics,
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

  /* Names from docs/04-api-contract.md: actor and subject, with subjectType
     as an extra narrowing the contract does not name but the data supports. */
  @Roles('OPERATIONS')
  @Get('audit-log')
  async audit(
    @Query('subjectType') subjectType?: string,
    @Query('subject') subject?: string,
    @Query('actor') actor?: string,
    @Query('cursor') cursor?: string,
  ): Promise<AuditPageResponse> {
    const page = await this.auditSearch.search({
      ...(subjectType === undefined ? {} : { subjectType }),
      ...(subject === undefined ? {} : { subjectId: subject }),
      ...(actor === undefined ? {} : { actorId: actor }),
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

  @Roles('OPERATIONS')
  @Post('reconciliation/run')
  @UseInterceptors(IdempotencyInterceptor)
  async reconcile(
    @CurrentAccount() account: Account,
    @Body(new ZodValidationPipe(reconcileRequestSchema)) body: ReconcileRequest,
  ): Promise<ReconciliationRunResponse> {
    const run = await this.reconcileVault.execute({
      vaultId: vaultIdOf(body.vaultId),
      countedReceiptIds: body.countedReceiptIds.map(receiptIdOf),
      requestedBy: account.id,
    });
    return {
      id: run.id,
      vaultId: run.vaultId,
      startedAt: new Date(Number(run.startedAt.epochMilliseconds)).toISOString(),
      drift: [...run.drift],
    };
  }

  /* The contract asks for the latest run rather than a list, which is what
     an operator opening the screen wants: the state of the last count, not a
     history to page through. */
  @Roles('OPERATIONS')
  @Get('reconciliation/latest')
  async latestReconciliation(): Promise<LatestReconciliationResponse> {
    const latest = await this.reconciliationHistory.latest();
    return { run: latest === null ? null : { ...latest, drift: [...latest.drift] } };
  }

  @Roles('OPERATIONS')
  @Get('loan-book')
  async readLoanBook(): Promise<LoanBookResponse> {
    const book = await this.loanBook.read();
    return {
      outstandingCount: book.outstandingCount,
      outstandingPrincipal: toMoneyDto(book.outstandingPrincipal),
      overdueCount: book.overdueCount,
      atRiskCount: book.atRiskCount,
      defaultedCount: book.defaultedCount,
    };
  }

  @Roles('OPERATIONS')
  @Get('exposure-by-vault')
  async exposureByVault(): Promise<ExposureByVaultResponse> {
    const items = await this.loanBook.exposureByVault();
    return {
      items: items.map((row) => ({
        vaultId: row.vaultId,
        exposure: toMoneyDto(row.exposure),
        insuredLimit: toMoneyDto(row.insuredLimit),
        receiptCount: row.receiptCount,
      })),
    };
  }

  /* What every route costs and how often it fails, counted in the serving
     process rather than shipped to a backend nobody has running yet. */
  @Roles('OPERATIONS')
  @Get('metrics')
  readMetrics(): RequestMetricsResponse {
    return { routes: [...this.requestMetrics.snapshot()] };
  }

  /* Events that gave up on delivery. Reading them is how an operator learns
     the queue lost something rather than finding out from a customer. */
  @Roles('OPERATIONS')
  @Get('dead-letters')
  async readDeadLetters(): Promise<DeadLettersResponse> {
    return { items: [...(await this.deadLetters.list())] };
  }

  @Roles('OPERATIONS')
  @Get('protocol-parameters')
  readParameters(): ProtocolParametersResponse {
    return toParametersResponse(this.protocolParameters.read());
  }

  @Roles('OPERATIONS')
  @Put('protocol-parameters')
  @UseInterceptors(IdempotencyInterceptor)
  async updateParameters(
    @CurrentAccount() account: Account,
    @Body(new ZodValidationPipe(updateParametersRequestSchema)) body: UpdateParametersRequest,
  ): Promise<ProtocolParametersResponse> {
    const view = await this.protocolParameters.execute({
      requestedBy: account.id,
      effectiveAt: Instant.fromEpochMilliseconds(BigInt(new Date(body.effectiveAt).getTime())),
      parameters: fromParametersDto(body.parameters),
    });
    return toParametersResponse(view);
  }
}

function toParametersResponse(view: ProtocolParametersView): ProtocolParametersResponse {
  return {
    current: toParametersDto(view.current),
    history: view.history.map((version) => ({
      id: version.id,
      effectiveAt: new Date(Number(version.effectiveAt.epochMilliseconds)).toISOString(),
      writtenByAccountId: version.writtenByAccountId,
      parameters: toParametersDto(version.parameters),
    })),
  };
}
