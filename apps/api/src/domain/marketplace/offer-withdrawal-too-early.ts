import { DomainError } from '../shared/domain-error';

export class OfferWithdrawalTooEarly extends DomainError {
  readonly code = 'OFFER_WITHDRAWAL_TOO_EARLY';

  constructor() {
    super('The offer cannot be withdrawn during its minimum lifetime.');
  }
}
