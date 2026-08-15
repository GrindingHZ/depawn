import { DomainError } from '../shared/domain-error';

export class ListingExpired extends DomainError {
  readonly code = 'LISTING_EXPIRED';

  constructor() {
    super('The listing has expired.');
  }
}
