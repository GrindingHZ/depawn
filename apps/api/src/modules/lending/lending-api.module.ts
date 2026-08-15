import { Module } from '@nestjs/common';
import { CUSTODY_RECEIPT_REPOSITORY } from '../../domain/custody/custody-receipt-repository';
import { LOAN_REPOSITORY } from '../../domain/lending/loan-repository';
import { LISTING_REPOSITORY } from '../../domain/marketplace/listing-repository';
import { LOAN_QUERIES } from '../../domain/ports/loan-queries.port';
import { PrismaCustodyReceiptRepository } from '../../infrastructure/persistence/repositories/prisma-custody-receipt.repository';
import { PrismaListingRepository } from '../../infrastructure/persistence/repositories/prisma-listing.repository';
import { PrismaLoanRepository } from '../../infrastructure/persistence/repositories/prisma-loan.repository';
import { PrismaLoanQueries } from '../../infrastructure/persistence/queries/prisma-loan-queries';
import { AcceptOfferUseCase } from './application/accept-offer.use-case';
import { LendingController } from './http/lending.controller';

@Module({
  controllers: [LendingController],
  providers: [
    AcceptOfferUseCase,
    { provide: LISTING_REPOSITORY, useClass: PrismaListingRepository },
    { provide: CUSTODY_RECEIPT_REPOSITORY, useClass: PrismaCustodyReceiptRepository },
    { provide: LOAN_REPOSITORY, useClass: PrismaLoanRepository },
    { provide: LOAN_QUERIES, useClass: PrismaLoanQueries },
  ],
})
export class LendingApiModule {}
