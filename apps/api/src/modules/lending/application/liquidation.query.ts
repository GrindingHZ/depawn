import { Inject, Injectable } from '@nestjs/common';
import type { Liquidation, LiquidationStatus } from '../../../domain/lending/liquidation';
import { LIQUIDATION_REPOSITORY } from '../../../domain/lending/liquidation-repository';
import type { LiquidationRepository } from '../../../domain/lending/liquidation-repository';
import { UNIT_OF_WORK } from '../../../domain/ports/unit-of-work';
import type { UnitOfWork } from '../../../domain/ports/unit-of-work';
import type { LiquidationId } from '../../../domain/shared/identifiers';

const everyStatus: readonly LiquidationStatus[] = ['SCHEDULED', 'BIDDING', 'SETTLED', 'CANCELLED'];

@Injectable()
export class LiquidationQuery {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    @Inject(LIQUIDATION_REPOSITORY) private readonly liquidations: LiquidationRepository,
  ) {}

  read(liquidationId: LiquidationId): Promise<Liquidation | null> {
    return this.unitOfWork.run((context) => this.liquidations.findById(liquidationId, context));
  }

  /* A sale is public by design: bidders need to see the book they are
     bidding into. */
  list(status?: LiquidationStatus): Promise<readonly Liquidation[]> {
    const statuses = status === undefined ? everyStatus : [status];
    return this.unitOfWork.run((context) => this.liquidations.listByStatus(statuses, context));
  }
}
