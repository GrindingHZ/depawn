import type { ItemCategory } from '../custody/item-category';
import type { Money } from '../shared/money';
import { failure, ok } from '../shared/result';
import type { Result } from '../shared/result';
import { LoanToValueExceeded } from './loan-to-value-exceeded';
import type { ProtocolParameters } from './protocol-parameters';

/* Rule M5: principal <= appraisedValue * cap / 10000, checked at listing
   creation, offer creation, and again at origination. */
export function assertWithinLoanToValue(
  principal: Money,
  appraisedValue: Money,
  category: ItemCategory,
  parameters: ProtocolParameters,
): Result<void, LoanToValueExceeded> {
  const capBasisPoints = parameters.maxLoanToValueBasisPointsByCategory[category];
  const maxPrincipal = appraisedValue.multiplyByBasisPoints(capBasisPoints);
  if (principal.isGreaterThan(maxPrincipal)) {
    return failure(new LoanToValueExceeded(maxPrincipal));
  }
  return ok(undefined);
}
