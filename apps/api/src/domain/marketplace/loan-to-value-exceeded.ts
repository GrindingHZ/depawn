import { DomainError } from '../shared/domain-error';
import type { Money } from '../shared/money';

export class LoanToValueExceeded extends DomainError {
  readonly code = 'LOAN_TO_VALUE_EXCEEDED';

  constructor(readonly maxPrincipal: Money) {
    super('Requested principal exceeds the maximum for this item category.');
  }
}
