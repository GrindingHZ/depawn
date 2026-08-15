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
import type { FundsHold, SettlementPort } from '../../../domain/ports/settlement.port';
import { UNIT_OF_WORK } from '../../../domain/ports/unit-of-work';
import type { UnitOfWork } from '../../../domain/ports/unit-of-work';
import type { AccountId, ListingId, OfferId } from '../../../domain/shared/identifiers';
import type { Offer } from '../../../domain/marketplace/offer';
import { failure, ok } from '../../../domain/shared/result';
import type { Result } from '../../../domain/shared/result';
import type { SettlementRef } from '../../../domain/shared/settlement-ref';

export interface WithdrawOfferCommand {
  readonly listingId: ListingId;
  readonly offerId: OfferId;
  readonly requestedBy: AccountId;
}

/* The settlement adapter resolves a hold by id and reads its state from the
   funds hold row, so the reconstructed object only carries identity. */
export function holdOf(offer: Offer, settledAt: SettlementRef['settledAt']): FundsHold {
  return {
    id: offer.fundsHoldId,
    accountId: offer.lenderAccountId,
    amount: offer.principal,
    settlementRef: { kind: 'ledger', reference: offer.fundsHoldId, settledAt },
  };
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
        holdOf(withdrawn.value.offer, now),
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
          after: { settlementRef: settlementRef.reference },
        },
        context,
      );
      return ok(settlementRef);
    });
  }
}
