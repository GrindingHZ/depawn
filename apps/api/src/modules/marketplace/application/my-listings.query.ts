import { Inject, Injectable } from '@nestjs/common';
import type { Listing } from '../../../domain/marketplace/listing';
import { LISTING_REPOSITORY } from '../../../domain/marketplace/listing-repository';
import type { ListingRepository } from '../../../domain/marketplace/listing-repository';
import { UNIT_OF_WORK } from '../../../domain/ports/unit-of-work';
import type { UnitOfWork } from '../../../domain/ports/unit-of-work';
import type { AccountId } from '../../../domain/shared/identifiers';

@Injectable()
export class MyListingsQuery {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    @Inject(LISTING_REPOSITORY) private readonly listings: ListingRepository,
  ) {}

  listFor(borrower: AccountId): Promise<readonly Listing[]> {
    return this.unitOfWork.run((context) => this.listings.listByBorrower(borrower, context));
  }
}
