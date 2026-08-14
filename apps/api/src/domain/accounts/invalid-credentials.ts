import { DomainError } from '../shared/domain-error';

export class InvalidCredentials extends DomainError {
  readonly code = 'UNAUTHENTICATED';

  constructor() {
    super('Email or password is incorrect.');
  }
}
