import { DomainError } from '../shared/domain-error';

export class OfferNotFound extends DomainError {
  readonly code = 'NOT_FOUND';

  constructor() {
    super('No offer exists with this id.');
  }
}
