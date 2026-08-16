import { Module } from '@nestjs/common';
import { CUSTODY_RECEIPT_REPOSITORY } from '../../domain/custody/custody-receipt-repository';
import { LIQUIDATION_REPOSITORY } from '../../domain/lending/liquidation-repository';
import { LOAN_REPOSITORY } from '../../domain/lending/loan-repository';
import { LISTING_REPOSITORY } from '../../domain/marketplace/listing-repository';
import { LOAN_QUERIES } from '../../domain/ports/loan-queries.port';
import { PrismaCustodyReceiptRepository } from '../../infrastructure/persistence/repositories/prisma-custody-receipt.repository';
import { PrismaListingRepository } from '../../infrastructure/persistence/repositories/prisma-listing.repository';
import { PrismaLiquidationRepository } from '../../infrastructure/persistence/repositories/prisma-liquidation.repository';
import { PrismaLoanRepository } from '../../infrastructure/persistence/repositories/prisma-loan.repository';
import { PrismaLoanQueries } from '../../infrastructure/persistence/queries/prisma-loan-queries';
import { AcceptOfferUseCase } from './application/accept-offer.use-case';
import { ClaimReceiptUseCase } from './application/claim-receipt.use-case';
import { MarkDefaultUseCase } from './application/mark-default.use-case';
import { PayoffQuoteQuery } from './application/payoff-quote.query';
import { RepayLoanUseCase } from './application/repay-loan.use-case';
import { CloseLiquidationUseCase } from './application/close-liquidation.use-case';
import { LiquidationQuery } from './application/liquidation.query';
import { OpenLiquidationUseCase } from './application/open-liquidation.use-case';
import { PlaceBidUseCase } from './application/place-bid.use-case';
import { ReclaimBidUseCase } from './application/reclaim-bid.use-case';
import { ScheduleLiquidationUseCase } from './application/schedule-liquidation.use-case';
import { LendingController } from './http/lending.controller';
import { LiquidationController } from './http/liquidation.controller';

@Module({
  controllers: [LendingController, LiquidationController],
  providers: [
    AcceptOfferUseCase,
    PayoffQuoteQuery,
    RepayLoanUseCase,
    MarkDefaultUseCase,
    ClaimReceiptUseCase,
    ScheduleLiquidationUseCase,
    OpenLiquidationUseCase,
    PlaceBidUseCase,
    CloseLiquidationUseCase,
    ReclaimBidUseCase,
    LiquidationQuery,
    { provide: LIQUIDATION_REPOSITORY, useClass: PrismaLiquidationRepository },
    { provide: LISTING_REPOSITORY, useClass: PrismaListingRepository },
    { provide: CUSTODY_RECEIPT_REPOSITORY, useClass: PrismaCustodyReceiptRepository },
    { provide: LOAN_REPOSITORY, useClass: PrismaLoanRepository },
    { provide: LOAN_QUERIES, useClass: PrismaLoanQueries },
  ],
})
export class LendingApiModule {}
