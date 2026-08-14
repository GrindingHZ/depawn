import { DomainError } from '../shared/domain-error';

export class EmailAlreadyRegistered extends DomainError {
  readonly code = 'EMAIL_ALREADY_REGISTERED';

  constructor() {
    super('An account with this email already exists.');
  }
}
