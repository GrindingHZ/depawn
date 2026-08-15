import { DomainError } from '../shared/domain-error';

export class NotResourceOwner extends DomainError {
  readonly code = 'FORBIDDEN';

  constructor() {
    super('You do not control this resource.');
  }
}
