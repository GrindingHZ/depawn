import { DomainError } from '../shared/domain-error';

export class LoanNotFound extends DomainError {
  readonly code = 'NOT_FOUND';

  constructor() {
    super('The loan does not exist.');
  }
}
