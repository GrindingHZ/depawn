import { Inject, Injectable } from '@nestjs/common';
import { CUSTODY_RECEIPT_REPOSITORY } from '../../../domain/custody/custody-receipt-repository';
import type { CustodyReceiptRepository } from '../../../domain/custody/custody-receipt-repository';
import { ReceiptNotInVault } from '../../../domain/custody/receipt-not-in-vault';
import type { Listing } from '../../../domain/marketplace/listing';
import { LISTING_REPOSITORY } from '../../../domain/marketplace/listing-repository';
import type { ListingRepository } from '../../../domain/marketplace/listing-repository';
import type { ListingExpired } from '../../../domain/marketplace/listing-expired';
import { ListingNotFound } from '../../../domain/marketplace/listing-not-found';
import type { ListingNotDraft } from '../../../domain/marketplace/listing-not-draft';
import { NotResourceOwner } from '../../../domain/marketplace/not-resource-owner';
import { AUDIT_PORT } from '../../../domain/ports/audit.port';
import type { AuditPort } from '../../../domain/ports/audit.port';
import { CLOCK_PORT } from '../../../domain/ports/clock.port';
import type { ClockPort } from '../../../domain/ports/clock.port';
import { DOMAIN_EVENT_PUBLISHER } from '../../../domain/ports/domain-event-publisher.port';
import type { DomainEventPublisher } from '../../../domain/ports/domain-event-publisher.port';
import { SYSTEM_STATE_PORT } from '../../../domain/ports/system-state.port';
import type { SystemStatePort } from '../../../domain/ports/system-state.port';
import { UNIT_OF_WORK } from '../../../domain/ports/unit-of-work';
import type { UnitOfWork } from '../../../domain/ports/unit-of-work';
import type { AccountId, ListingId } from '../../../domain/shared/identifiers';
import { SystemPaused } from '../../../domain/shared/system-paused';
import { failure, ok } from '../../../domain/shared/result';
import type { Result } from '../../../domain/shared/result';

export interface PublishListingCommand {
  readonly listingId: ListingId;
  readonly requestedBy: AccountId;
}

type PublishRejection =
  | ListingNotFound
  | NotResourceOwner
  | ListingNotDraft
  | ListingExpired
  | ReceiptNotInVault
  | SystemPaused;

@Injectable()
export class PublishListingUseCase {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    @Inject(SYSTEM_STATE_PORT) private readonly systemState: SystemStatePort,
    @Inject(LISTING_REPOSITORY) private readonly listings: ListingRepository,
    @Inject(CUSTODY_RECEIPT_REPOSITORY) private readonly receipts: CustodyReceiptRepository,
    @Inject(DOMAIN_EVENT_PUBLISHER) private readonly events: DomainEventPublisher,
    @Inject(AUDIT_PORT) private readonly audit: AuditPort,
    @Inject(CLOCK_PORT) private readonly clock: ClockPort,
  ) {}

  execute(command: PublishListingCommand): Promise<Result<Listing, PublishRejection>> {
    return this.unitOfWork.run(async (context) => {
      // Flow 11 blocks this entrance while the system is paused. The
      // flows that return money or collateral never carry this check.
      if ((await this.systemState.read(context)).isPaused) {
        return failure(new SystemPaused());
      }
      await this.listings.lock(command.listingId, context);
      const listing = await this.listings.findById(command.listingId, context);
      if (listing === null) {
        return failure(new ListingNotFound());
      }
      if (listing.borrowerAccountId !== command.requestedBy) {
        return failure(new NotResourceOwner());
      }
      const receipt = await this.receipts.findById(listing.receiptId, context);
      if (receipt === null || receipt.status !== 'IN_VAULT') {
        return failure(new ReceiptNotInVault());
      }
      if (receipt.holderAccountId !== command.requestedBy) {
        return failure(new NotResourceOwner());
      }

      const published = listing.publish(this.clock.now());
      if (!published.ok) {
        return published;
      }
      await this.listings.save(published.value, context);
      await this.events.publish(
        [
          {
            type: 'ListingPublished',
            listingId: listing.id,
            borrowerAccountId: listing.borrowerAccountId,
          },
        ],
        context,
      );
      await this.audit.record(
        {
          actorType: 'ACCOUNT',
          actorId: command.requestedBy,
          subjectType: 'listing',
          subjectId: listing.id,
          action: 'publish_listing',
          before: { status: listing.status },
          after: { status: published.value.status },
        },
        context,
      );
      return ok(published.value);
    });
  }
}
