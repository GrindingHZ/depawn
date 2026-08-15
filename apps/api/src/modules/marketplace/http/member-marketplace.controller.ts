import { Controller, Get, Inject, Param, Post, UseInterceptors } from '@nestjs/common';
import type { MyListingsResponse, MyOffersResponse, SettlementResponse } from '@depawn/contracts';
import type { Account } from '../../../domain/accounts/account';
import { MARKETPLACE_QUERIES } from '../../../domain/ports/marketplace-queries.port';
import type { MarketplaceQueries } from '../../../domain/ports/marketplace-queries.port';
import { offerIdOf } from '../../../domain/shared/identifiers';
import { CurrentAccount } from '../../shared/http/current-account.decorator';
import { DomainErrorHttpException } from '../../shared/http/domain-error-http.exception';
import { IdempotencyInterceptor } from '../../shared/http/idempotency.interceptor';
import { toSettlementRefDto } from '../../shared/http/money.mapper';
import { MyListingsQuery } from '../application/my-listings.query';
import { ReclaimHoldUseCase } from '../application/reclaim-hold.use-case';
import {
  marketplaceStatusFor,
  toListingResponse,
  toOfferResponse,
} from './marketplace-response.mapper';

@Controller('me')
export class MemberMarketplaceController {
  constructor(
    private readonly reclaimHold: ReclaimHoldUseCase,
    private readonly myListingsQuery: MyListingsQuery,
    @Inject(MARKETPLACE_QUERIES) private readonly queries: MarketplaceQueries,
  ) {}

  @Get('listings')
  async myListings(@CurrentAccount() account: Account): Promise<MyListingsResponse> {
    const listings = await this.myListingsQuery.listFor(account.id);
    return { items: listings.map(toListingResponse) };
  }

  @Get('offers')
  async myOffers(@CurrentAccount() account: Account): Promise<MyOffersResponse> {
    const offers = await this.queries.offersByLender(account.id);
    return { items: offers.map(toOfferResponse) };
  }

  @Post('offers/:offerId/reclaim')
  @UseInterceptors(IdempotencyInterceptor)
  async reclaim(
    @Param('offerId') offerId: string,
    @CurrentAccount() account: Account,
  ): Promise<SettlementResponse> {
    const result = await this.reclaimHold.execute({
      offerId: offerIdOf(offerId),
      requestedBy: account.id,
    });
    if (!result.ok) {
      throw new DomainErrorHttpException(result.error, marketplaceStatusFor(result.error.code));
    }
    return { settlementRef: toSettlementRefDto(result.value) };
  }
}
