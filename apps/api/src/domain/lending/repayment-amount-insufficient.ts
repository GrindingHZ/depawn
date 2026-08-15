import { DomainError } from '../shared/domain-error';
import type { Money } from '../shared/money';

/* Partial repayment is out of scope for v1 and must never be taken quietly
   (docs/10-flows.md flow 5), so the rejection carries what was owed. */
export class RepaymentAmountInsufficient extends DomainError {
  readonly code = 'REPAYMENT_AMOUNT_INSUFFICIENT';

  constructor(readonly amountDue: Money) {
    super('The payment does not cover the amount due.');
  }
}
