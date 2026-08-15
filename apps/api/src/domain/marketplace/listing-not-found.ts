import { DomainError } from '../shared/domain-error';

export class ListingNotFound extends DomainError {
  readonly code = 'NOT_FOUND';

  constructor() {
    super('No listing exists with this id.');
  }
}
