import { DomainError } from '../shared/domain-error';

export class RedemptionAlreadyReleased extends DomainError {
  readonly code = 'REDEMPTION_ALREADY_RELEASED';

  constructor() {
    super('The item has already been handed over.');
  }
}
