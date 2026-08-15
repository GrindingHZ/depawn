import { DomainError } from '../shared/domain-error';

export class LoanNotActive extends DomainError {
  readonly code = 'LOAN_NOT_ACTIVE';

  constructor() {
    super('The loan is not active.');
  }
}
