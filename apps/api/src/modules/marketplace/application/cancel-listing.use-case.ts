import { Inject, Injectable } from '@nestjs/common';
import type { Listing, ListingCancellationRejected } from '../../../domain/marketplace/listing';
import { LISTING_REPOSITORY } from '../../../domain/marketplace/listing-repository';
import type { ListingRepository } from '../../../domain/marketplace/listing-repository';
import { ListingNotFound } from '../../../domain/marketplace/listing-not-found';
import { AUDIT_PORT } from '../../../domain/ports/audit.port';
import type { AuditPort } from '../../../domain/ports/audit.port';
import { UNIT_OF_WORK } from '../../../domain/ports/unit-of-work';
import type { UnitOfWork } from '../../../domain/ports/unit-of-work';
import type { AccountId, ListingId } from '../../../domain/shared/identifiers';
import { failure, ok } from '../../../domain/shared/result';
import type { Result } from '../../../domain/shared/result';

export interface CancelListingCommand {
  readonly listingId: ListingId;
  readonly requestedBy: AccountId;
}

@Injectable()
export class CancelListingUseCase {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    @Inject(LISTING_REPOSITORY) private readonly listings: ListingRepository,
    @Inject(AUDIT_PORT) private readonly audit: AuditPort,
  ) {}

  execute(
    command: CancelListingCommand,
  ): Promise<Result<Listing, ListingNotFound | ListingCancellationRejected>> {
    return this.unitOfWork.run(async (context) => {
      await this.listings.lock(command.listingId, context);
      const listing = await this.listings.findById(command.listingId, context);
      if (listing === null) {
        return failure(new ListingNotFound());
      }

      // Pending offers become SUPERSEDED and are not refunded; the lenders
      // reclaim their own holds (rule M8).
      const cancelled = listing.cancel(command.requestedBy);
      if (!cancelled.ok) {
        return cancelled;
      }
      await this.listings.save(cancelled.value.listing, context);
      await this.audit.record(
        {
          actorType: 'ACCOUNT',
          actorId: command.requestedBy,
          subjectType: 'listing',
          subjectId: listing.id,
          action: 'cancel_listing',
          after: { supersededOfferIds: cancelled.value.supersededOfferIds },
        },
        context,
      );
      return ok(cancelled.value.listing);
    });
  }
}
