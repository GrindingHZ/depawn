import { DomainError } from '../shared/domain-error';

export class LiquidationNotOpen extends DomainError {
  readonly code = 'LIQUIDATION_NOT_OPEN';

  constructor() {
    super('The liquidation is not open for bidding.');
  }
}
