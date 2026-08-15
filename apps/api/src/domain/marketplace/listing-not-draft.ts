import { DomainError } from '../shared/domain-error';

export class ListingNotDraft extends DomainError {
  readonly code = 'LISTING_NOT_DRAFT';

  constructor() {
    super('The listing is not a draft.');
  }
}
