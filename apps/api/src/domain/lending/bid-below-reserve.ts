import { DomainError } from '../shared/domain-error';
import type { Money } from '../shared/money';

/* One code covers the reserve and the standing high bid, because to a bidder
   both mean the same thing: this is the number to beat. */
export class BidBelowReserve extends DomainError {
  readonly code = 'BID_BELOW_RESERVE';

  constructor(readonly amountToBeat: Money) {
    super('The bid does not clear the amount to beat.');
  }
}
