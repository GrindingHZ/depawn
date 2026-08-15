import { DomainError } from '../shared/domain-error';

export class RedemptionRequestNotFound extends DomainError {
  readonly code = 'NOT_FOUND';

  constructor() {
    super('The redemption request does not exist.');
  }
}
