import { Inject, Injectable } from '@nestjs/common';
import { HoldNotReclaimable } from '../../../domain/marketplace/hold-not-reclaimable';
import { LISTING_REPOSITORY } from '../../../domain/marketplace/listing-repository';
import type { ListingRepository } from '../../../domain/marketplace/listing-repository';
import { NotResourceOwner } from '../../../domain/marketplace/not-resource-owner';
import { OfferNotFound } from '../../../domain/marketplace/offer-not-found';
import { AUDIT_PORT } from '../../../domain/ports/audit.port';
import type { AuditPort } from '../../../domain/ports/audit.port';
import { CLOCK_PORT } from '../../../domain/ports/clock.port';
import type { ClockPort } from '../../../domain/ports/clock.port';
import { SETTLEMENT_PORT } from '../../../domain/ports/settlement.port';
import type { SettlementPort } from '../../../domain/ports/settlement.port';
import { UNIT_OF_WORK } from '../../../domain/ports/unit-of-work';
import type { UnitOfWork } from '../../../domain/ports/unit-of-work';
import type { AccountId, OfferId } from '../../../domain/shared/identifiers';
import { failure, ok } from '../../../domain/shared/result';
import type { Result } from '../../../domain/shared/result';
import type { SettlementRef } from '../../../domain/shared/settlement-ref';
import { holdOfOffer } from '../../shared/application/hold-of-offer';

export interface ReclaimHoldCommand {
  readonly offerId: OfferId;
  readonly requestedBy: AccountId;
}

type ReclaimRejection = OfferNotFound | NotResourceOwner | HoldNotReclaimable;

/* The pull side of rule M8. A repeat reclaim replays the original settlement
   reference through the funds hold's exactly once semantics, so it is a
   no-op rather than a double refund. */
@Injectable()
export class ReclaimHoldUseCase {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    @Inject(LISTING_REPOSITORY) private readonly listings: ListingRepository,
    @Inject(SETTLEMENT_PORT) private readonly settlement: SettlementPort,
    @Inject(AUDIT_PORT) private readonly audit: AuditPort,
    @Inject(CLOCK_PORT) private readonly clock: ClockPort,
  ) {}

  execute(command: ReclaimHoldCommand): Promise<Result<SettlementRef, ReclaimRejection>> {
    return this.unitOfWork.run(async (context) => {
      const listing = await this.listings.findByOffer(command.offerId, context);
      const offer = listing?.offers.find((candidate) => candidate.id === command.offerId);
      if (listing === undefined || listing === null || offer === undefined) {
        return failure(new OfferNotFound());
      }
      if (offer.lenderAccountId !== command.requestedBy) {
        return failure(new NotResourceOwner());
      }
      const isExpiredPending = offer.status === 'PENDING' && offer.isExpired(this.clock.now());
      if (offer.status !== 'SUPERSEDED' && offer.status !== 'EXPIRED' && !isExpiredPending) {
        return failure(new HoldNotReclaimable());
      }

      // An expired PENDING offer reclaims without a status write: acceptance
      // already rejects expired offers, and the refunded hold blocks any
      // release, so the row's lazy status is harmless.
      const settlementRef = await this.settlement.refundHold(
        holdOfOffer(offer, this.clock.now()),
        context,
      );
      await this.audit.record(
        {
          actorType: 'ACCOUNT',
          actorId: command.requestedBy,
          subjectType: 'offer',
          subjectId: command.offerId,
          action: 'reclaim_hold',
          after: { settlementRef: settlementRef.reference },
        },
        context,
      );
      return ok(settlementRef);
    });
  }
}
