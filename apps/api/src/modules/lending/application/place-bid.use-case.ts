import { Inject, Injectable } from '@nestjs/common';
import type { Liquidation } from '../../../domain/lending/liquidation';
import { LIQUIDATION_REPOSITORY } from '../../../domain/lending/liquidation-repository';
import type { LiquidationRepository } from '../../../domain/lending/liquidation-repository';
import { LiquidationNotFound } from '../../../domain/lending/liquidation-not-found';
import { AUDIT_PORT } from '../../../domain/ports/audit.port';
import type { AuditPort } from '../../../domain/ports/audit.port';
import { CLOCK_PORT } from '../../../domain/ports/clock.port';
import type { ClockPort } from '../../../domain/ports/clock.port';
import { SETTLEMENT_PORT } from '../../../domain/ports/settlement.port';
import type { SettlementPort } from '../../../domain/ports/settlement.port';
import { SYSTEM_STATE_PORT } from '../../../domain/ports/system-state.port';
import type { SystemStatePort } from '../../../domain/ports/system-state.port';
import { UNIT_OF_WORK } from '../../../domain/ports/unit-of-work';
import type { UnitOfWork } from '../../../domain/ports/unit-of-work';
import { DomainError } from '../../../domain/shared/domain-error';
import { ID_GENERATOR } from '../../../domain/shared/id-generator';
import type { IdGenerator } from '../../../domain/shared/id-generator';
import { fundsHoldIdOf } from '../../../domain/shared/identifiers';
import type { AccountId, LiquidationId } from '../../../domain/shared/identifiers';
import type { Money } from '../../../domain/shared/money';
import { SystemPaused } from '../../../domain/shared/system-paused';
import { failure, ok } from '../../../domain/shared/result';
import type { Result } from '../../../domain/shared/result';

export interface PlaceBidCommand {
  readonly liquidationId: LiquidationId;
  readonly bidderAccountId: AccountId;
  readonly amount: Money;
}

/* Flow 8 step 3. Funds are held at bid time, exactly as they are at offer
   time, so a winning bid is money that provably exists. The beaten bidder's
   hold becomes reclaimable rather than being pushed back, the same pull not
   push decision as rule M8. */
@Injectable()
export class PlaceBidUseCase {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    @Inject(SYSTEM_STATE_PORT) private readonly systemState: SystemStatePort,
    @Inject(LIQUIDATION_REPOSITORY) private readonly liquidations: LiquidationRepository,
    @Inject(SETTLEMENT_PORT) private readonly settlement: SettlementPort,
    @Inject(AUDIT_PORT) private readonly audit: AuditPort,
    @Inject(CLOCK_PORT) private readonly clock: ClockPort,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
  ) {}

  async execute(command: PlaceBidCommand): Promise<Result<Liquidation, DomainError>> {
    try {
      return await this.unitOfWork.run(async (context) => {
        // Flow 11 blocks this entrance while the system is paused. The
        // flows that return money or collateral never carry this check.
        if ((await this.systemState.read(context)).isPaused) {
          return failure(new SystemPaused());
        }
        await this.liquidations.lock(command.liquidationId, context);
        const liquidation = await this.liquidations.findById(command.liquidationId, context);
        if (liquidation === null) {
          return failure(new LiquidationNotFound());
        }

        const now = this.clock.now();
        // Validated on a probe carrying a placeholder hold id the checks
        // never read, before any money moves, matching place offer.
        const probe = liquidation.placeBid(
          {
            id: 'pending',
            bidderAccountId: command.bidderAccountId,
            amount: command.amount,
            fundsHoldId: fundsHoldIdOf('pending'),
            placedAt: now,
          },
          now,
        );
        if (!probe.ok) {
          return probe;
        }

        const hold = await this.settlement.hold(
          {
            accountId: command.bidderAccountId,
            amount: command.amount,
            reference: liquidation.id,
          },
          context,
        );
        const accepted = liquidation.placeBid(
          {
            id: this.idGenerator.generate(),
            bidderAccountId: command.bidderAccountId,
            amount: command.amount,
            fundsHoldId: hold.id,
            placedAt: now,
          },
          now,
        );
        if (!accepted.ok) {
          throw accepted.error;
        }

        await this.liquidations.save(accepted.value.liquidation, context);
        await this.audit.record(
          {
            actorType: 'ACCOUNT',
            actorId: command.bidderAccountId,
            subjectType: 'liquidation',
            subjectId: liquidation.id,
            action: 'place_bid',
            after: {
              amount: command.amount.minorUnits.toString(),
              beatenBidId: accepted.value.beatenBid?.id ?? null,
            },
          },
          context,
        );
        return ok(accepted.value.liquidation);
      });
    } catch (error) {
      if (error instanceof DomainError) {
        return failure(error);
      }
      throw error;
    }
  }
}
