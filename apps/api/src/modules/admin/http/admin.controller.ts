import { Body, Controller, Get, Post, Query, UseInterceptors } from '@nestjs/common';
import { pauseSystemRequestSchema, reconcileRequestSchema } from '@depawn/contracts';
import type {
  AuditPageResponse,
  ExposureByVaultResponse,
  LoanBookResponse,
  PauseSystemRequest,
  ReconcileRequest,
  LatestReconciliationResponse,
  ReconciliationRunResponse,
  SystemStateResponse,
} from '@depawn/contracts';
import type { Account } from '../../../domain/accounts/account';
import type { SystemState } from '../../../domain/ports/system-state.port';
import { receiptIdOf, vaultIdOf } from '../../../domain/shared/identifiers';
import { toMoneyDto } from '../../shared/http/money.mapper';
import { CurrentAccount } from '../../shared/http/current-account.decorator';
import { IdempotencyInterceptor } from '../../shared/http/idempotency.interceptor';
import { Roles } from '../../shared/http/roles.decorator';
import { ZodValidationPipe } from '../../shared/http/zod-validation.pipe';
import { AuditSearchQuery } from '../application/audit-search.query';
import { LoanBookQuery } from '../application/loan-book.query';
import { ReconcileVaultUseCase } from '../application/reconcile-vault.use-case';
import { ReconciliationHistoryQuery } from '../application/reconciliation-history.query';
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
    private readonly reconcileVault: ReconcileVaultUseCase,
    private readonly reconciliationHistory: ReconciliationHistoryQuery,
    private readonly loanBook: LoanBookQuery,
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
}
