import { Inject, Injectable } from '@nestjs/common';
import { CUSTODY_RECEIPT_REPOSITORY } from '../../../domain/custody/custody-receipt-repository';
import type { CustodyReceiptRepository } from '../../../domain/custody/custody-receipt-repository';
import { LISTING_REPOSITORY } from '../../../domain/marketplace/listing-repository';
import type { ListingRepository } from '../../../domain/marketplace/listing-repository';
import { ListingNotFound } from '../../../domain/marketplace/listing-not-found';
import { Offer } from '../../../domain/marketplace/offer';
import { PROTOCOL_PARAMETERS } from '../../../domain/marketplace/protocol-parameters';
import type { ProtocolParameters } from '../../../domain/marketplace/protocol-parameters';
import { ReceiptNotFound } from '../../../domain/marketplace/receipt-not-found';
import { AUDIT_PORT } from '../../../domain/ports/audit.port';
import type { AuditPort } from '../../../domain/ports/audit.port';
import { CLOCK_PORT } from '../../../domain/ports/clock.port';
import type { ClockPort } from '../../../domain/ports/clock.port';
import { DOMAIN_EVENT_PUBLISHER } from '../../../domain/ports/domain-event-publisher.port';
import type { DomainEventPublisher } from '../../../domain/ports/domain-event-publisher.port';
import { SETTLEMENT_PORT } from '../../../domain/ports/settlement.port';
import type { SettlementPort } from '../../../domain/ports/settlement.port';
import { SYSTEM_STATE_PORT } from '../../../domain/ports/system-state.port';
import type { SystemStatePort } from '../../../domain/ports/system-state.port';
import { UNIT_OF_WORK } from '../../../domain/ports/unit-of-work';
import type { UnitOfWork } from '../../../domain/ports/unit-of-work';
import { DomainError } from '../../../domain/shared/domain-error';
import { ID_GENERATOR } from '../../../domain/shared/id-generator';
import type { IdGenerator } from '../../../domain/shared/id-generator';
import { fundsHoldIdOf, offerIdOf } from '../../../domain/shared/identifiers';
import type { AccountId, ListingId } from '../../../domain/shared/identifiers';
import type { Instant } from '../../../domain/shared/instant';
import type { Money } from '../../../domain/shared/money';
import { SystemPaused } from '../../../domain/shared/system-paused';
import { failure, ok } from '../../../domain/shared/result';
import type { Result } from '../../../domain/shared/result';

export interface PlaceOfferCommand {
  readonly listingId: ListingId;
  readonly lenderAccountId: AccountId;
  readonly principal: Money;
  readonly annualPercentageRateBasisPoints: number;
  readonly durationMs: bigint;
  readonly expiresAt: Instant;
}

/* Wider than the aggregate's union because the hold precedes validation and
   both the hold rejection and the aggregate rejections surface through the
   same transaction-aborting throw. Controllers branch on the code. */
type PlaceOfferRejection = DomainError;

@Injectable()
export class PlaceOfferUseCase {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    @Inject(SYSTEM_STATE_PORT) private readonly systemState: SystemStatePort,
    @Inject(LISTING_REPOSITORY) private readonly listings: ListingRepository,
    @Inject(CUSTODY_RECEIPT_REPOSITORY) private readonly receipts: CustodyReceiptRepository,
    @Inject(SETTLEMENT_PORT) private readonly settlement: SettlementPort,
    @Inject(DOMAIN_EVENT_PUBLISHER) private readonly events: DomainEventPublisher,
    @Inject(AUDIT_PORT) private readonly audit: AuditPort,
    @Inject(CLOCK_PORT) private readonly clock: ClockPort,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
    @Inject(PROTOCOL_PARAMETERS) private readonly parameters: ProtocolParameters,
  ) {}

  async execute(command: PlaceOfferCommand): Promise<Result<Offer, PlaceOfferRejection>> {
    try {
      return await this.unitOfWork.run(async (context) => {
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
        const receipt = await this.receipts.findById(listing.receiptId, context);
        if (receipt === null) {
          return failure(new ReceiptNotFound());
        }

        const now = this.clock.now();
        const offerId = offerIdOf(this.idGenerator.generate());
        const offerFields = {
          id: offerId,
          listingId: listing.id,
          lenderAccountId: command.lenderAccountId,
          principal: command.principal,
          annualPercentageRateBasisPoints: command.annualPercentageRateBasisPoints,
          durationMs: command.durationMs,
          expiresAt: command.expiresAt,
          createdAt: now,
        };

        // Validation runs before the hold, matching the order in flow 3, on
        // a probe carrying a placeholder hold id the checks never read.
        const probe = listing.addOffer(
          Offer.place({ ...offerFields, fundsHoldId: fundsHoldIdOf('pending') }),
          receipt.appraisedValue,
          receipt.itemCategory,
          this.parameters,
          now,
        );
        if (!probe.ok) {
          return probe;
        }

        // The hold happens at offer time, not acceptance (rule M3), inside
        // this same transaction.
        const hold = await this.settlement.hold(
          {
            accountId: command.lenderAccountId,
            amount: command.principal,
            reference: command.listingId,
          },
          context,
        );

        const offer = Offer.place({ ...offerFields, fundsHoldId: hold.id });
        const added = listing.addOffer(
          offer,
          receipt.appraisedValue,
          receipt.itemCategory,
          this.parameters,
          now,
        );
        if (!added.ok) {
          throw added.error;
        }

        await this.listings.save(added.value, context);
        await this.events.publish(
          [
            {
              type: 'OfferPlaced',
              listingId: listing.id,
              offerId: offer.id,
              principal: offer.principal,
              rateBasisPoints: offer.annualPercentageRateBasisPoints,
            },
          ],
          context,
        );
        await this.audit.record(
          {
            actorType: 'ACCOUNT',
            actorId: command.lenderAccountId,
            subjectType: 'offer',
            subjectId: offer.id,
            action: 'place_offer',
            after: { listingId: listing.id, fundsHoldId: hold.id },
          },
          context,
        );
        return ok(offer);
      });
    } catch (error) {
      if (error instanceof DomainError) {
        return failure(error);
      }
      throw error;
    }
  }
}
