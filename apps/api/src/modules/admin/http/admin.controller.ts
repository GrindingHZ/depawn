import { Body, Controller, Get, Inject, Post, Put, Query, UseInterceptors } from '@nestjs/common';
import {
  pauseSystemRequestSchema,
  reconcileRequestSchema,
  updateParametersRequestSchema,
} from '@depawn/contracts';
import type {
  AuditPageResponse,
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
import { Roles } from '../../shared/http/roles.decorator';
import { ZodValidationPipe } from '../../shared/http/zod-validation.pipe';
import { ProtocolParametersRegistry } from '../../../infrastructure/parameters/protocol-parameters.registry';
import { Instant } from '../../../domain/shared/instant';
import { ID_GENERATOR } from '../../../domain/shared/id-generator';
import type { IdGenerator } from '../../../domain/shared/id-generator';
import { AUDIT_PORT } from '../../../domain/ports/audit.port';
import type { AuditPort } from '../../../domain/ports/audit.port';
import { UNIT_OF_WORK } from '../../../domain/ports/unit-of-work';
import type { UnitOfWork } from '../../../domain/ports/unit-of-work';
import { fromParametersDto, toParametersDto } from './parameters.mapper';
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
    private readonly parameters: ProtocolParametersRegistry,
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    @Inject(AUDIT_PORT) private readonly auditLog: AuditPort,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
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

  @Roles('OPERATIONS')
  @Get('protocol-parameters')
  readParameters(): ProtocolParametersResponse {
    return this.parametersResponse();
  }

  /* An edit writes a version rather than changing the current one, so a loan
     already originated keeps the terms it was originated under. */
  @Roles('OPERATIONS')
  @Put('protocol-parameters')
  @UseInterceptors(IdempotencyInterceptor)
  async updateParameters(
    @CurrentAccount() account: Account,
    @Body(new ZodValidationPipe(updateParametersRequestSchema)) body: UpdateParametersRequest,
  ): Promise<ProtocolParametersResponse> {
    const id = this.idGenerator.generate();
    const effectiveAt = Instant.fromEpochMilliseconds(BigInt(new Date(body.effectiveAt).getTime()));
    const before = toParametersDto(this.parameters.current());
    await this.parameters.write(fromParametersDto(body.parameters), effectiveAt, account.id, id);
    await this.unitOfWork.run((context) =>
      this.auditLog.record(
        {
          actorType: 'ACCOUNT',
          actorId: account.id,
          subjectType: 'protocol_parameters',
          subjectId: id,
          action: 'update_protocol_parameters',
          before,
          after: { effectiveAt: body.effectiveAt, parameters: body.parameters },
        },
        context,
      ),
    );
    return this.parametersResponse();
  }

  private parametersResponse(): ProtocolParametersResponse {
    return {
      current: toParametersDto(this.parameters.current()),
      history: this.parameters.history().map((version) => ({
        id: version.id,
        effectiveAt: new Date(Number(version.effectiveAt.epochMilliseconds)).toISOString(),
        writtenByAccountId: version.writtenByAccountId,
        parameters: toParametersDto(version.parameters),
      })),
    };
  }
}
