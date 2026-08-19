import { Module } from '@nestjs/common';
import { LISTING_REPOSITORY } from '../../domain/marketplace/listing-repository';
import { MARKET_QUERIES } from '../../domain/ports/market-queries.port';
import { MARKETPLACE_QUERIES } from '../../domain/ports/marketplace-queries.port';
import { PrismaListingRepository } from '../../infrastructure/persistence/repositories/prisma-listing.repository';
import { PrismaMarketQueries } from '../../infrastructure/persistence/queries/prisma-market-queries';
import { PrismaMarketplaceQueries } from '../../infrastructure/persistence/queries/prisma-marketplace-queries';
import { CancelListingUseCase } from './application/cancel-listing.use-case';
import { CreateListingUseCase } from './application/create-listing.use-case';
import { ListingDetailQuery } from './application/listing-detail.query';
import { MyListingsQuery } from './application/my-listings.query';
import { PlaceOfferUseCase } from './application/place-offer.use-case';
import { PublishListingUseCase } from './application/publish-listing.use-case';
import { ReclaimHoldUseCase } from './application/reclaim-hold.use-case';
import { WithdrawOfferUseCase } from './application/withdraw-offer.use-case';
import { ListingController } from './http/listing.controller';
import { MarketController } from './http/market.controller';
import { MemberMarketplaceController } from './http/member-marketplace.controller';

@Module({
  controllers: [ListingController, MarketController, MemberMarketplaceController],
  providers: [
    CreateListingUseCase,
    PublishListingUseCase,
    CancelListingUseCase,
    PlaceOfferUseCase,
    WithdrawOfferUseCase,
    ReclaimHoldUseCase,
    ListingDetailQuery,
    MyListingsQuery,
    { provide: LISTING_REPOSITORY, useClass: PrismaListingRepository },
    { provide: MARKETPLACE_QUERIES, useClass: PrismaMarketplaceQueries },
    { provide: MARKET_QUERIES, useClass: PrismaMarketQueries },
  ],
})
export class MarketplaceApiModule {}
