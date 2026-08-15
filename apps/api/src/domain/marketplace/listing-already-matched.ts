import { DomainError } from '../shared/domain-error';

export class ListingAlreadyMatched extends DomainError {
  readonly code = 'LISTING_ALREADY_MATCHED';

  constructor() {
    super('The listing was already matched.');
  }
}
