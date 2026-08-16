import { DomainError } from '../shared/domain-error';
import type { Instant } from '../shared/instant';

/* Carries the instant the item becomes sellable, because operations
   scheduling a sale need to know when to come back. */
export class HoldingPeriodActive extends DomainError {
  readonly code = 'HOLDING_PERIOD_ACTIVE';

  constructor(readonly holdingEndsAt: Instant) {
    super('The statutory holding period has not elapsed.');
  }
}
