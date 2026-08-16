import { DomainError } from '../shared/domain-error';

export class LiquidationNotFound extends DomainError {
  readonly code = 'NOT_FOUND';

  constructor() {
    super('The liquidation does not exist.');
  }
}
