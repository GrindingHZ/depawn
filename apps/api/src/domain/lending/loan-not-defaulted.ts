import { DomainError } from '../shared/domain-error';

export class LoanNotDefaulted extends DomainError {
  readonly code = 'LOAN_NOT_DEFAULTED';

  constructor() {
    super('The loan has not been marked defaulted.');
  }
}
