import { DomainError } from '../shared/domain-error';

export class RedemptionNotVerified extends DomainError {
  readonly code = 'REDEMPTION_NOT_VERIFIED';

  constructor() {
    super('The redemption request has not been verified yet.');
  }
}
