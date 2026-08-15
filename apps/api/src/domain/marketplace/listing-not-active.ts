import { DomainError } from '../shared/domain-error';

export class ListingNotActive extends DomainError {
  readonly code = 'LISTING_NOT_ACTIVE';

  constructor() {
    super('The listing is not active.');
  }
}
