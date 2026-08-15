import { DomainError } from '../shared/domain-error';
import type { Money } from '../shared/money';

/* Interest moves with time, so a quote the borrower is acting on can already
   be wrong. The current figure travels with the rejection because the UI has
   to show what changed rather than retry silently (docs/10-flows.md flow 5). */
export class PayoffQuoteStale extends DomainError {
  readonly code = 'PAYOFF_QUOTE_STALE';

  constructor(readonly amountDue: Money) {
    super('The payoff quote is no longer current.');
  }
}
