import type { UnitOfWorkContext } from '../ports/unit-of-work';
import type { LiquidationId, LoanId } from '../shared/identifiers';
import type { Liquidation, LiquidationStatus } from './liquidation';

export interface LiquidationRepository {
  findById(id: LiquidationId, context: UnitOfWorkContext): Promise<Liquidation | null>;
  findByLoan(loanId: LoanId, context: UnitOfWorkContext): Promise<Liquidation | null>;
  listByStatus(
    statuses: readonly LiquidationStatus[],
    context: UnitOfWorkContext,
  ): Promise<readonly Liquidation[]>;
  /* Serialises bidding against closing, so a bid cannot land after the
     winner has been chosen. */
  lock(id: LiquidationId, context: UnitOfWorkContext): Promise<void>;
  save(liquidation: Liquidation, context: UnitOfWorkContext): Promise<void>;
}

export const LIQUIDATION_REPOSITORY = Symbol('LiquidationRepository');
