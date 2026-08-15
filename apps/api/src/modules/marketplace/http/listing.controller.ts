import {
  Body,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Post,
  Query,
  UseInterceptors,
} from '@nestjs/common';
import { createListingRequestSchema, placeOfferRequestSchema } from '@depawn/contracts';
import type {
  CreateListingRequest,
  ListingDetailResponse,
  ListingResponse,
  ListingsPageResponse,
  OfferResponse,
  PlaceOfferRequest,
  SettlementResponse,
} from '@depawn/contracts';
import type { Account } from '../../../domain/accounts/account';
import { MARKETPLACE_QUERIES } from '../../../domain/ports/marketplace-queries.port';
import type { MarketplaceQueries } from '../../../domain/ports/marketplace-queries.port';
import { CLOCK_PORT } from '../../../domain/ports/clock.port';
import type { ClockPort } from '../../../domain/ports/clock.port';
import { listingIdOf, offerIdOf, receiptIdOf } from '../../../domain/shared/identifiers';
import { Instant } from '../../../domain/shared/instant';
import { CurrentAccount } from '../../shared/http/current-account.decorator';
import { DomainErrorHttpException } from '../../shared/http/domain-error-http.exception';
import { IdempotencyInterceptor } from '../../shared/http/idempotency.interceptor';
import { toMoney, toMoneyDto, toSettlementRefDto } from '../../shared/http/money.mapper';
import { Public } from '../../shared/http/public.decorator';
import { ZodValidationPipe } from '../../shared/http/zod-validation.pipe';
import { CancelListingUseCase } from '../application/cancel-listing.use-case';
import { CreateListingUseCase } from '../application/create-listing.use-case';
import { ListingDetailQuery } from '../application/listing-detail.query';
import { PlaceOfferUseCase } from '../application/place-offer.use-case';
import { PublishListingUseCase } from '../application/publish-listing.use-case';
import { WithdrawOfferUseCase } from '../application/withdraw-offer.use-case';
import {
  marketplaceStatusFor,
  toListingResponse,
  toListingSummary,
  toOfferResponse,
  toRankedOfferResponse,
} from './marketplace-response.mapper';

function instantOfIso(value: string): Instant {
  return Instant.fromEpochMilliseconds(BigInt(new Date(value).getTime()));
}

@Controller('listings')
export class ListingController {
  constructor(
    private readonly createListing: CreateListingUseCase,
    private readonly publishListing: PublishListingUseCase,
    private readonly cancelListing: CancelListingUseCase,
    private readonly placeOffer: PlaceOfferUseCase,
    private readonly withdrawOffer: WithdrawOfferUseCase,
    private readonly listingDetail: ListingDetailQuery,
    @Inject(MARKETPLACE_QUERIES) private readonly queries: MarketplaceQueries,
    @Inject(CLOCK_PORT) private readonly clock: ClockPort,
  ) {}

  @Post()
  @UseInterceptors(IdempotencyInterceptor)
  async create(
    @CurrentAccount() account: Account,
    @Body(new ZodValidationPipe(createListingRequestSchema)) body: CreateListingRequest,
  ): Promise<ListingResponse> {
    const result = await this.createListing.execute({
      requestedBy: account.id,
      receiptId: receiptIdOf(body.receiptId),
      requestedPrincipal: toMoney(body.requestedPrincipal),
      maxAnnualPercentageRateBasisPoints: body.maxAnnualPercentageRateBasisPoints,
      requestedDurationMs: BigInt(body.requestedDurationMs),
      expiresAt: instantOfIso(body.expiresAt),
    });
    if (!result.ok) {
      throw new DomainErrorHttpException(result.error, marketplaceStatusFor(result.error.code));
    }
    return toListingResponse(result.value);
  }

  @Post(':listingId/publish')
  @UseInterceptors(IdempotencyInterceptor)
  async publish(
    @Param('listingId') listingId: string,
    @CurrentAccount() account: Account,
  ): Promise<ListingResponse> {
    const result = await this.publishListing.execute({
      listingId: listingIdOf(listingId),
      requestedBy: account.id,
    });
    if (!result.ok) {
      throw new DomainErrorHttpException(result.error, marketplaceStatusFor(result.error.code));
    }
    return toListingResponse(result.value);
  }

  @Post(':listingId/cancel')
  @UseInterceptors(IdempotencyInterceptor)
  async cancel(
    @Param('listingId') listingId: string,
    @CurrentAccount() account: Account,
  ): Promise<ListingResponse> {
    const result = await this.cancelListing.execute({
      listingId: listingIdOf(listingId),
      requestedBy: account.id,
    });
    if (!result.ok) {
      throw new DomainErrorHttpException(result.error, marketplaceStatusFor(result.error.code));
    }
    return toListingResponse(result.value);
  }

  @Public()
  @Get()
  async browse(@Query('cursor') cursor?: string): Promise<ListingsPageResponse> {
    const page = await this.queries.browseActive(cursor ?? null, 25, this.clock.now());
    return { items: page.items.map(toListingSummary), nextCursor: page.nextCursor };
  }

  @Public()
  @Get(':listingId')
  async read(@Param('listingId') listingId: string): Promise<ListingDetailResponse> {
    const detail = await this.listingDetail.read(listingIdOf(listingId));
    if (detail === null) {
      throw new NotFoundException();
    }
    return {
      ...toListingResponse(detail.listing),
      appraisedValue: toMoneyDto(detail.receipt.appraisedValue),
      itemCategory: detail.receipt.itemCategory,
      maxPrincipal: toMoneyDto(detail.maxPrincipal),
      offerBook: detail.offerBook.map(toRankedOfferResponse),
    };
  }

  @Post(':listingId/offers')
  @UseInterceptors(IdempotencyInterceptor)
  async offer(
    @Param('listingId') listingId: string,
    @CurrentAccount() account: Account,
    @Body(new ZodValidationPipe(placeOfferRequestSchema)) body: PlaceOfferRequest,
  ): Promise<OfferResponse> {
    const result = await this.placeOffer.execute({
      listingId: listingIdOf(listingId),
      lenderAccountId: account.id,
      principal: toMoney(body.principal),
      annualPercentageRateBasisPoints: body.annualPercentageRateBasisPoints,
      durationMs: BigInt(body.durationMs),
      expiresAt: instantOfIso(body.expiresAt),
    });
    if (!result.ok) {
      throw new DomainErrorHttpException(result.error, marketplaceStatusFor(result.error.code));
    }
    return toOfferResponse(result.value);
  }

  @Post(':listingId/offers/:offerId/withdraw')
  @UseInterceptors(IdempotencyInterceptor)
  async withdraw(
    @Param('listingId') listingId: string,
    @Param('offerId') offerId: string,
    @CurrentAccount() account: Account,
  ): Promise<SettlementResponse> {
    const result = await this.withdrawOffer.execute({
      listingId: listingIdOf(listingId),
      offerId: offerIdOf(offerId),
      requestedBy: account.id,
    });
    if (!result.ok) {
      throw new DomainErrorHttpException(result.error, marketplaceStatusFor(result.error.code));
    }
    return { settlementRef: toSettlementRefDto(result.value) };
  }
}
