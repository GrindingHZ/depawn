import { DomainError } from '../shared/domain-error';

export class OfferNotPending extends DomainError {
  readonly code = 'OFFER_NOT_PENDING';

  constructor() {
    super('The offer is no longer pending.');
  }
}
