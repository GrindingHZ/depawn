import { Inject, Injectable } from '@nestjs/common';
import { CUSTODY_RECEIPT_REPOSITORY } from '../../../domain/custody/custody-receipt-repository';
import type { CustodyReceiptRepository } from '../../../domain/custody/custody-receipt-repository';
import type { CustodyReceipt } from '../../../domain/custody/custody-receipt';
import type { Listing } from '../../../domain/marketplace/listing';
import { LISTING_REPOSITORY } from '../../../domain/marketplace/listing-repository';
import type { ListingRepository } from '../../../domain/marketplace/listing-repository';
import { PROTOCOL_PARAMETERS } from '../../../domain/marketplace/protocol-parameters';
import type { ProtocolParameters } from '../../../domain/marketplace/protocol-parameters';
import { rankOffers } from '../../../domain/marketplace/rank-offers';
import type { RankedOffer } from '../../../domain/marketplace/rank-offers';
import { MARKETPLACE_QUERIES } from '../../../domain/ports/marketplace-queries.port';
import type { MarketplaceQueries } from '../../../domain/ports/marketplace-queries.port';
import { UNIT_OF_WORK } from '../../../domain/ports/unit-of-work';
import type { UnitOfWork } from '../../../domain/ports/unit-of-work';
import type { ListingId } from '../../../domain/shared/identifiers';
import type { Money } from '../../../domain/shared/money';

export interface ListingDetail {
  readonly listing: Listing;
  readonly receipt: CustodyReceipt;
  readonly maxPrincipal: Money;
  readonly offerBook: readonly RankedOffer[];
  readonly hasPhotograph: boolean;
}

@Injectable()
export class ListingDetailQuery {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    @Inject(LISTING_REPOSITORY) private readonly listings: ListingRepository,
    @Inject(CUSTODY_RECEIPT_REPOSITORY) private readonly receipts: CustodyReceiptRepository,
    @Inject(PROTOCOL_PARAMETERS) private readonly parameters: ProtocolParameters,
    @Inject(MARKETPLACE_QUERIES) private readonly queries: MarketplaceQueries,
  ) {}

  read(listingId: ListingId): Promise<ListingDetail | null> {
    return this.unitOfWork.run(async (context) => {
      const listing = await this.listings.findById(listingId, context);
      if (listing === null) {
        return null;
      }
      const receipt = await this.receipts.findById(listing.receiptId, context);
      if (receipt === null) {
        return null;
      }
      const capBasisPoints =
        this.parameters.maxLoanToValueBasisPointsByCategory[receipt.itemCategory];
      return {
        listing,
        receipt,
        maxPrincipal: receipt.appraisedValue.multiplyByBasisPoints(capBasisPoints),
        offerBook: rankOffers(listing.offers, listing),
        hasPhotograph: await this.queries.photographExists(listing.receiptId),
      };
    });
  }
}
