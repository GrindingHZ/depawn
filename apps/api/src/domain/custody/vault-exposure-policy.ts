import type { Money } from '../shared/money';
import { failure, ok } from '../shared/result';
import type { Result } from '../shared/result';
import { VaultInsuredLimitExceeded } from './vault-insured-limit-exceeded';

/* Business rule C5: total appraised value of live receipts per vault must not
   exceed that vault's insured limit. Exactly at the limit is allowed. */
export function assertWithinInsuredLimit(
  currentExposure: Money,
  additionalValue: Money,
  insuredLimit: Money,
): Result<void, VaultInsuredLimitExceeded> {
  if (currentExposure.plus(additionalValue).isGreaterThan(insuredLimit)) {
    return failure(new VaultInsuredLimitExceeded());
  }
  return ok(undefined);
}
