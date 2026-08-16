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
  /* A category with no cap would put undefined into money arithmetic and lend
     against a NaN. Refusing loudly is the only safe reading of a parameter set
     that has fallen behind the categories the vault accepts. */
  if (typeof capBasisPoints !== 'number') {
    throw new Error(`No loan to value cap is configured for ${category}`);
  }
  const maxPrincipal = appraisedValue.multiplyByBasisPoints(capBasisPoints);
  if (principal.isGreaterThan(maxPrincipal)) {
    return failure(new LoanToValueExceeded(maxPrincipal));
  }
  return ok(undefined);
}
