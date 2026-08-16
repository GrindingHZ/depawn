import { Inject, Injectable } from '@nestjs/common';
import type { Liquidation } from '../../../domain/lending/liquidation';
import { LIQUIDATION_REPOSITORY } from '../../../domain/lending/liquidation-repository';
import type { LiquidationRepository } from '../../../domain/lending/liquidation-repository';
import { LiquidationNotFound } from '../../../domain/lending/liquidation-not-found';
import { AUDIT_PORT } from '../../../domain/ports/audit.port';
import type { AuditPort } from '../../../domain/ports/audit.port';
import { CLOCK_PORT } from '../../../domain/ports/clock.port';
import type { ClockPort } from '../../../domain/ports/clock.port';
import { UNIT_OF_WORK } from '../../../domain/ports/unit-of-work';
import type { UnitOfWork } from '../../../domain/ports/unit-of-work';
import type { DomainError } from '../../../domain/shared/domain-error';
import type { AccountId, LiquidationId } from '../../../domain/shared/identifiers';
import { failure, ok } from '../../../domain/shared/result';
import type { Result } from '../../../domain/shared/result';

export interface OpenLiquidationCommand {
  readonly liquidationId: LiquidationId;
  readonly requestedBy: AccountId;
  readonly biddingWindowMs: bigint;
}

/* Flow 8 step 2. */
@Injectable()
export class OpenLiquidationUseCase {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    @Inject(LIQUIDATION_REPOSITORY) private readonly liquidations: LiquidationRepository,
    @Inject(AUDIT_PORT) private readonly audit: AuditPort,
    @Inject(CLOCK_PORT) private readonly clock: ClockPort,
  ) {}

  execute(command: OpenLiquidationCommand): Promise<Result<Liquidation, DomainError>> {
    return this.unitOfWork.run(async (context) => {
      await this.liquidations.lock(command.liquidationId, context);
      const liquidation = await this.liquidations.findById(command.liquidationId, context);
      if (liquidation === null) {
        return failure(new LiquidationNotFound());
      }

      const now = this.clock.now();
      const opened = liquidation.open(now, now.plusMilliseconds(command.biddingWindowMs));
      if (!opened.ok) {
        return opened;
      }
      await this.liquidations.save(opened.value, context);
      await this.audit.record(
        {
          actorType: 'ACCOUNT',
          actorId: command.requestedBy,
          subjectType: 'liquidation',
          subjectId: liquidation.id,
          action: 'open_liquidation',
          after: { closesAt: opened.value.closesAt?.epochMilliseconds.toString() },
        },
        context,
      );
      return ok(opened.value);
    });
  }
}
