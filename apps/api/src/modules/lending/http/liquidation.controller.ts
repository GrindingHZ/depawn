import { Body, Controller, Get, Param, Post, Query, UseInterceptors } from '@nestjs/common';
import {
  liquidationStatusSchema,
  openLiquidationRequestSchema,
  placeBidRequestSchema,
  scheduleLiquidationRequestSchema,
} from '@depawn/contracts';
import type {
  LiquidationListResponse,
  LiquidationResponse,
  OpenLiquidationRequest,
  PlaceBidRequest,
  ScheduleLiquidationRequest,
  SettlementResponse,
} from '@depawn/contracts';
import type { Account } from '../../../domain/accounts/account';
import type { LiquidationStatus } from '../../../domain/lending/liquidation';
import { liquidationIdOf, loanIdOf } from '../../../domain/shared/identifiers';
import { CurrentAccount } from '../../shared/http/current-account.decorator';
import { DomainErrorHttpException } from '../../shared/http/domain-error-http.exception';
import { domainErrorStatusFor } from '../../shared/http/domain-error-status';
import { IdempotencyInterceptor } from '../../shared/http/idempotency.interceptor';
import { toMoney, toSettlementRefDto } from '../../shared/http/money.mapper';
import { Roles } from '../../shared/http/roles.decorator';
import { ZodValidationPipe } from '../../shared/http/zod-validation.pipe';
import { CloseLiquidationUseCase } from '../application/close-liquidation.use-case';
import { LiquidationQuery } from '../application/liquidation.query';
import { OpenLiquidationUseCase } from '../application/open-liquidation.use-case';
import { PlaceBidUseCase } from '../application/place-bid.use-case';
import { ReclaimBidUseCase } from '../application/reclaim-bid.use-case';
import { ScheduleLiquidationUseCase } from '../application/schedule-liquidation.use-case';
import { toLiquidationResponse } from './lending-response.mapper';

@Controller()
export class LiquidationController {
  constructor(
    private readonly scheduleLiquidation: ScheduleLiquidationUseCase,
    private readonly openLiquidation: OpenLiquidationUseCase,
    private readonly placeBid: PlaceBidUseCase,
    private readonly closeLiquidation: CloseLiquidationUseCase,
    private readonly reclaimBid: ReclaimBidUseCase,
    private readonly liquidations: LiquidationQuery,
  ) {}

  @Roles('OPERATIONS')
  @Post('loans/:loanId/liquidations')
  @UseInterceptors(IdempotencyInterceptor)
  async schedule(
    @Param('loanId') loanId: string,
    @CurrentAccount() account: Account,
    @Body(new ZodValidationPipe(scheduleLiquidationRequestSchema))
    body: ScheduleLiquidationRequest,
  ): Promise<LiquidationResponse> {
    const result = await this.scheduleLiquidation.execute({
      loanId: loanIdOf(loanId),
      requestedBy: account.id,
      reservePrice: toMoney(body.reservePrice),
    });
    if (!result.ok) {
      throw new DomainErrorHttpException(result.error, domainErrorStatusFor(result.error.code));
    }
    return toLiquidationResponse(result.value);
  }

  @Roles('OPERATIONS')
  @Post('liquidations/:liquidationId/open')
  @UseInterceptors(IdempotencyInterceptor)
  async open(
    @Param('liquidationId') liquidationId: string,
    @CurrentAccount() account: Account,
    @Body(new ZodValidationPipe(openLiquidationRequestSchema)) body: OpenLiquidationRequest,
  ): Promise<LiquidationResponse> {
    const result = await this.openLiquidation.execute({
      liquidationId: liquidationIdOf(liquidationId),
      requestedBy: account.id,
      biddingWindowMs: BigInt(body.biddingWindowMs),
    });
    if (!result.ok) {
      throw new DomainErrorHttpException(result.error, domainErrorStatusFor(result.error.code));
    }
    return toLiquidationResponse(result.value);
  }

  @Get('liquidations')
  async list(
    @Query('status', new ZodValidationPipe(liquidationStatusSchema.optional()))
    status?: LiquidationStatus,
  ): Promise<LiquidationListResponse> {
    const items = await this.liquidations.list(status);
    return { items: items.map(toLiquidationResponse) };
  }

  @Get('liquidations/:liquidationId')
  async read(@Param('liquidationId') liquidationId: string): Promise<LiquidationResponse> {
    const liquidation = await this.liquidations.read(liquidationIdOf(liquidationId));
    if (liquidation === null) {
      throw new DomainErrorHttpException(
        { code: 'NOT_FOUND', message: 'The liquidation does not exist.' },
        404,
      );
    }
    return toLiquidationResponse(liquidation);
  }

  @Post('liquidations/:liquidationId/bids')
  @UseInterceptors(IdempotencyInterceptor)
  async bid(
    @Param('liquidationId') liquidationId: string,
    @CurrentAccount() account: Account,
    @Body(new ZodValidationPipe(placeBidRequestSchema)) body: PlaceBidRequest,
  ): Promise<LiquidationResponse> {
    const result = await this.placeBid.execute({
      liquidationId: liquidationIdOf(liquidationId),
      bidderAccountId: account.id,
      amount: toMoney(body.amount),
    });
    if (!result.ok) {
      throw new DomainErrorHttpException(result.error, domainErrorStatusFor(result.error.code));
    }
    return toLiquidationResponse(result.value);
  }

  /* Any bidder may pull back a beaten bid; nobody else may pull it for
     them, which the use case checks against the bid's owner. */
  @Post('liquidations/:liquidationId/bids/:bidId/reclaim')
  @UseInterceptors(IdempotencyInterceptor)
  async reclaim(
    @Param('liquidationId') liquidationId: string,
    @Param('bidId') bidId: string,
    @CurrentAccount() account: Account,
  ): Promise<SettlementResponse> {
    const result = await this.reclaimBid.execute({
      liquidationId: liquidationIdOf(liquidationId),
      bidId,
      requestedBy: account.id,
    });
    if (!result.ok) {
      throw new DomainErrorHttpException(result.error, domainErrorStatusFor(result.error.code));
    }
    return { settlementRef: toSettlementRefDto(result.value) };
  }

  @Roles('OPERATIONS')
  @Post('liquidations/:liquidationId/close')
  @UseInterceptors(IdempotencyInterceptor)
  async close(
    @Param('liquidationId') liquidationId: string,
    @CurrentAccount() account: Account,
  ): Promise<LiquidationResponse> {
    const result = await this.closeLiquidation.execute({
      liquidationId: liquidationIdOf(liquidationId),
      requestedBy: account.id,
    });
    if (!result.ok) {
      throw new DomainErrorHttpException(result.error, domainErrorStatusFor(result.error.code));
    }
    return toLiquidationResponse(result.value.liquidation);
  }
}
