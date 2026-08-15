import { DomainError } from '../shared/domain-error';
import type { Instant } from '../shared/instant';

/* Carries the instant the borrower has until, because a lender told only
   that it is too early will ask when. */
export class GracePeriodActive extends DomainError {
  readonly code = 'GRACE_PERIOD_ACTIVE';

  constructor(readonly graceEndsAt: Instant) {
    super('The borrower is still within the grace period.');
  }
}
