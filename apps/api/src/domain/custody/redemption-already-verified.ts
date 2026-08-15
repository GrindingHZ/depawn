import { DomainError } from '../shared/domain-error';

/* Distinct from RedemptionNotVerified because staff at a counter act on this
   message: telling them identity has not been checked when it just was is
   worse than telling them nothing. */
export class RedemptionAlreadyVerified extends DomainError {
  readonly code = 'REDEMPTION_ALREADY_VERIFIED';

  constructor() {
    super('The redemption request has already been verified.');
  }
}
