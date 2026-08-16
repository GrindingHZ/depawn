import { DomainError } from '../shared/domain-error';

export class LiquidationNotScheduled extends DomainError {
  readonly code = 'LIQUIDATION_NOT_SCHEDULED';

  constructor() {
    super('The liquidation is not scheduled.');
  }
}
