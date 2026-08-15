import { DomainError } from '../shared/domain-error';

export class RateAboveMaximum extends DomainError {
  readonly code = 'RATE_ABOVE_MAXIMUM';

  constructor() {
    super('The rate is above the allowed maximum.');
  }
}
