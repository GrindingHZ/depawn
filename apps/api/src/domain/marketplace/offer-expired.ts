import { DomainError } from '../shared/domain-error';

export class OfferExpired extends DomainError {
  readonly code = 'OFFER_EXPIRED';

  constructor() {
    super('The offer has expired.');
  }
}
