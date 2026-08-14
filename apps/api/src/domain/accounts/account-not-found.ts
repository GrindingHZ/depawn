import { DomainError } from '../shared/domain-error';

export class AccountNotFound extends DomainError {
  readonly code = 'NOT_FOUND';

  constructor() {
    super('No account exists for this email.');
  }
}
