import { Inject, Injectable } from '@nestjs/common';
import type { Bid } from '../../../domain/lending/liquidation';
import { LIQUIDATION_REPOSITORY } from '../../../domain/lending/liquidation-repository';
import type { LiquidationRepository } from '../../../domain/lending/liquidation-repository';
import { LiquidationNotFound } from '../../../domain/lending/liquidation-not-found';
import { HoldNotReclaimable } from '../../../domain/marketplace/hold-not-reclaimable';
import { NotResourceOwner } from '../../../domain/marketplace/not-resource-owner';
import { AUDIT_PORT } from '../../../domain/ports/audit.port';
import type { AuditPort } from '../../../domain/ports/audit.port';
import { CLOCK_PORT } from '../../../domain/ports/clock.port';
import type { ClockPort } from '../../../domain/ports/clock.port';
import { SETTLEMENT_PORT } from '../../../domain/ports/settlement.port';
import type { SettlementPort } from '../../../domain/ports/settlement.port';
import { UNIT_OF_WORK } from '../../../domain/ports/unit-of-work';
import type { UnitOfWork } from '../../../domain/ports/unit-of-work';
import type { DomainError } from '../../../domain/shared/domain-error';
import type { AccountId, LiquidationId } from '../../../domain/shared/identifiers';
import { failure, ok } from '../../../domain/shared/result';
import type { Result } from '../../../domain/shared/result';
import type { SettlementRef } from '../../../domain/shared/settlement-ref';

export interface ReclaimBidCommand {
  readonly liquidationId: LiquidationId;
  readonly bidId: string;
  readonly requestedBy: AccountId;
}

/* The pull side of bidding, the same shape as reclaiming a superseded offer
   (flow 8 step 3, flow 9). A bid that has been beaten, or that lost a sale
   already settled, is money the bidder can take back; the standing high bid
   on a live sale is not. A repeat reclaim replays the original settlement
   through the funds hold's exactly once semantics. */
@Injectable()
export class ReclaimBidUseCase {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    @Inject(LIQUIDATION_REPOSITORY) private readonly liquidations: LiquidationRepository,
    @Inject(SETTLEMENT_PORT) private readonly settlement: SettlementPort,
    @Inject(AUDIT_PORT) private readonly audit: AuditPort,
    @Inject(CLOCK_PORT) private readonly clock: ClockPort,
  ) {}

  execute(command: ReclaimBidCommand): Promise<Result<SettlementRef, DomainError>> {
    return this.unitOfWork.run(async (context) => {
      await this.liquidations.lock(command.liquidationId, context);
      const liquidation = await this.liquidations.findById(command.liquidationId, context);
      if (liquidation === null) {
        return failure(new LiquidationNotFound());
      }
      const bid = liquidation.bids.find((candidate) => candidate.id === command.bidId);
      if (bid === undefined) {
        return failure(new LiquidationNotFound());
      }
      if (bid.bidderAccountId !== command.requestedBy) {
        return failure(new NotResourceOwner());
      }
      if (!isReclaimable(liquidation.highestBid(), liquidation.winningBidId, bid)) {
        return failure(new HoldNotReclaimable());
      }

      const now = this.clock.now();
      const settlementRef = await this.settlement.refundHold(
        {
          id: bid.fundsHoldId,
          accountId: bid.bidderAccountId,
          amount: bid.amount,
          settlementRef: { kind: 'ledger', reference: bid.fundsHoldId, settledAt: now },
        },
        context,
      );
      await this.audit.record(
        {
          actorType: 'ACCOUNT',
          actorId: command.requestedBy,
          subjectType: 'liquidation',
          subjectId: liquidation.id,
          action: 'reclaim_bid',
          after: { bidId: bid.id, settlementRef: settlementRef.reference },
        },
        context,
      );
      return ok(settlementRef);
    });
  }
}

/* The winning bid of a settled sale has already been spent, and the standing
   high bid of a live one is still in play; everything else is the bidder's. */
function isReclaimable(highest: Bid | null, winningBidId: string | null, bid: Bid): boolean {
  if (winningBidId !== null) {
    return winningBidId !== bid.id;
  }
  return highest === null || highest.id !== bid.id;
}
