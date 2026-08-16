import { Inject, Injectable } from '@nestjs/common';
import type { OfferWithdrawalRejected } from '../../../domain/marketplace/listing';
import { LISTING_REPOSITORY } from '../../../domain/marketplace/listing-repository';
import type { ListingRepository } from '../../../domain/marketplace/listing-repository';
import { OfferNotFound } from '../../../domain/marketplace/offer-not-found';
import { PROTOCOL_PARAMETERS } from '../../../domain/marketplace/protocol-parameters';
import type { ProtocolParameters } from '../../../domain/marketplace/protocol-parameters';
import { AUDIT_PORT } from '../../../domain/ports/audit.port';
import type { AuditPort } from '../../../domain/ports/audit.port';
import { CLOCK_PORT } from '../../../domain/ports/clock.port';
import type { ClockPort } from '../../../domain/ports/clock.port';
import { DOMAIN_EVENT_PUBLISHER } from '../../../domain/ports/domain-event-publisher.port';
import type { DomainEventPublisher } from '../../../domain/ports/domain-event-publisher.port';
import { SETTLEMENT_PORT } from '../../../domain/ports/settlement.port';
import type { SettlementPort } from '../../../domain/ports/settlement.port';
import { UNIT_OF_WORK } from '../../../domain/ports/unit-of-work';
import type { UnitOfWork } from '../../../domain/ports/unit-of-work';
import type { AccountId, ListingId, OfferId } from '../../../domain/shared/identifiers';
import { failure, ok } from '../../../domain/shared/result';
import type { Result } from '../../../domain/shared/result';
import type { SettlementRef } from '../../../domain/shared/settlement-ref';
import { holdOfOffer } from '../../shared/application/hold-of-offer';

export interface WithdrawOfferCommand {
  readonly listingId: ListingId;
  readonly offerId: OfferId;
  readonly requestedBy: AccountId;
}

@Injectable()
export class WithdrawOfferUseCase {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    @Inject(LISTING_REPOSITORY) private readonly listings: ListingRepository,
    @Inject(SETTLEMENT_PORT) private readonly settlement: SettlementPort,
    @Inject(DOMAIN_EVENT_PUBLISHER) private readonly events: DomainEventPublisher,
    @Inject(AUDIT_PORT) private readonly audit: AuditPort,
    @Inject(CLOCK_PORT) private readonly clock: ClockPort,
    @Inject(PROTOCOL_PARAMETERS) private readonly parameters: ProtocolParameters,
  ) {}

  execute(
    command: WithdrawOfferCommand,
  ): Promise<Result<SettlementRef, OfferNotFound | OfferWithdrawalRejected>> {
    return this.unitOfWork.run(async (context) => {
      await this.listings.lock(command.listingId, context);
      const listing = await this.listings.findById(command.listingId, context);
      if (listing === null) {
        return failure(new OfferNotFound());
      }

      const now = this.clock.now();
      // Read the prior status off the aggregate rather than restating the
      // transition's precondition, so the record cannot drift from the rule.
      const priorStatus = listing.offers.find(
        (candidate) => candidate.id === command.offerId,
      )?.status;
      const withdrawn = listing.withdrawOffer(
        command.offerId,
        command.requestedBy,
        this.parameters,
        now,
      );
      if (!withdrawn.ok) {
        return withdrawn;
      }

      const settlementRef = await this.settlement.refundHold(
        holdOfOffer(withdrawn.value.offer, now),
        context,
      );
      await this.listings.save(withdrawn.value.listing, context);
      await this.events.publish([{ type: 'OfferWithdrawn', offerId: command.offerId }], context);
      await this.audit.record(
        {
          actorType: 'ACCOUNT',
          actorId: command.requestedBy,
          subjectType: 'offer',
          subjectId: command.offerId,
          action: 'withdraw_offer',
          before: { status: priorStatus },
          after: { settlementRef: settlementRef.reference },
        },
        context,
      );
      return ok(settlementRef);
    });
  }
}
