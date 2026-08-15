import { DomainError } from '../shared/domain-error';

export class IntakeNotFound extends DomainError {
  readonly code = 'NOT_FOUND';

  constructor() {
    super('No intake record exists with this id.');
  }
}
