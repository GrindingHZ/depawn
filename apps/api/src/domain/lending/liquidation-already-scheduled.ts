import { DomainError } from '../shared/domain-error';

export class LiquidationAlreadyScheduled extends DomainError {
  readonly code = 'LIQUIDATION_ALREADY_SCHEDULED';

  constructor() {
    super('This loan already has a liquidation.');
  }
}
