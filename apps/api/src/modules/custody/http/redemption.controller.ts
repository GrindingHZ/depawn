import { Body, Controller, Get, Param, Post, Query, UseInterceptors } from '@nestjs/common';
import { confirmReleaseRequestSchema, redemptionStatusSchema } from '@depawn/contracts';
import type {
  ConfirmReleaseRequest,
  RedemptionRequestListResponse,
  RedemptionRequestResponse,
} from '@depawn/contracts';
import type { Account } from '../../../domain/accounts/account';
import type { RedemptionStatus } from '../../../domain/custody/redemption-request';
import { receiptIdOf, redemptionRequestIdOf, vaultIdOf } from '../../../domain/shared/identifiers';
import { CurrentAccount } from '../../shared/http/current-account.decorator';
import { DomainErrorHttpException } from '../../shared/http/domain-error-http.exception';
import { IdempotencyInterceptor } from '../../shared/http/idempotency.interceptor';
import { Roles } from '../../shared/http/roles.decorator';
import { ZodValidationPipe } from '../../shared/http/zod-validation.pipe';
import { ConfirmReleaseUseCase } from '../application/confirm-release.use-case';
import { RedemptionQueueQuery } from '../application/redemption-queue.query';
import { RequestRedemptionUseCase } from '../application/request-redemption.use-case';
import { VerifyRedemptionUseCase } from '../application/verify-redemption.use-case';
import { custodyStatusFor, toRedemptionRequestResponse } from './custody-response.mapper';

@Controller()
export class RedemptionController {
  constructor(
    private readonly requestRedemption: RequestRedemptionUseCase,
    private readonly verifyRedemption: VerifyRedemptionUseCase,
    private readonly confirmRelease: ConfirmReleaseUseCase,
    private readonly queue: RedemptionQueueQuery,
  ) {}

  @Post('receipts/:receiptId/redemption-requests')
  @UseInterceptors(IdempotencyInterceptor)
  async request(
    @Param('receiptId') receiptId: string,
    @CurrentAccount() account: Account,
  ): Promise<RedemptionRequestResponse> {
    const result = await this.requestRedemption.execute({
      receiptId: receiptIdOf(receiptId),
      requestedBy: account.id,
    });
    if (!result.ok) {
      throw new DomainErrorHttpException(result.error, custodyStatusFor(result.error.code));
    }
    return toRedemptionRequestResponse(result.value);
  }

  @Get('me/redemption-requests')
  async listMine(@CurrentAccount() account: Account): Promise<RedemptionRequestListResponse> {
    const requests = await this.queue.listForRequester(account.id);
    return { items: requests.map(toRedemptionRequestResponse) };
  }

  @Roles('VAULT_STAFF')
  @Get('redemption-requests')
  async listForVault(
    @Query('vaultId') vaultId: string,
    @Query('status', new ZodValidationPipe(redemptionStatusSchema.optional()))
    status?: RedemptionStatus,
  ): Promise<RedemptionRequestListResponse> {
    // Without a status filter the queue is the outstanding work: anything
    // that has not left the vault yet.
    const statuses: readonly RedemptionStatus[] =
      status === undefined ? ['REQUESTED', 'VERIFIED'] : [status];
    const requests = await this.queue.listForVault(vaultIdOf(vaultId), statuses);
    return { items: requests.map(toRedemptionRequestResponse) };
  }

  @Roles('VAULT_STAFF')
  @Post('redemption-requests/:requestId/verify')
  @UseInterceptors(IdempotencyInterceptor)
  async verify(
    @Param('requestId') requestId: string,
    @CurrentAccount() account: Account,
  ): Promise<RedemptionRequestResponse> {
    const result = await this.verifyRedemption.execute({
      requestId: redemptionRequestIdOf(requestId),
      verifiedBy: account.id,
    });
    if (!result.ok) {
      throw new DomainErrorHttpException(result.error, custodyStatusFor(result.error.code));
    }
    return toRedemptionRequestResponse(result.value);
  }

  @Roles('VAULT_STAFF')
  @Post('redemption-requests/:requestId/release')
  @UseInterceptors(IdempotencyInterceptor)
  async release(
    @Param('requestId') requestId: string,
    @CurrentAccount() account: Account,
    @Body(new ZodValidationPipe(confirmReleaseRequestSchema)) body: ConfirmReleaseRequest,
  ): Promise<RedemptionRequestResponse> {
    const result = await this.confirmRelease.execute({
      requestId: redemptionRequestIdOf(requestId),
      releasedBy: account.id,
      sealNumberBroken: body.sealNumberBroken,
    });
    if (!result.ok) {
      throw new DomainErrorHttpException(result.error, custodyStatusFor(result.error.code));
    }
    return toRedemptionRequestResponse(result.value);
  }
}
