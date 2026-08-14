import { DomainError } from '../shared/domain-error';

export class InsufficientFunds extends DomainError {
  readonly code = 'INSUFFICIENT_FUNDS';

  constructor() {
    super('The available balance is below the requested amount.');
  }
}
