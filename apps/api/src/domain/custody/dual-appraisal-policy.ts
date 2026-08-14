import type { Appraisal } from './appraisal';
import type { Money } from '../shared/money';

/* Above the threshold a second independent appraiser must value the item
   before sealing (docs/10-flows.md flow 1 step 5). The threshold defaults
   high enough that the demo path is single appraisal (Q-005). */
export function requiresDualAppraisal(appraisedValue: Money, threshold: Money): boolean {
  return !appraisedValue.isLessThan(threshold);
}

export function hasSufficientAppraisals(
  appraisals: readonly Appraisal[],
  threshold: Money,
): boolean {
  if (appraisals.length === 0) {
    return false;
  }
  const highest = appraisals.reduce((maximum, appraisal) =>
    appraisal.value.isGreaterThan(maximum.value) ? appraisal : maximum,
  );
  if (!requiresDualAppraisal(highest.value, threshold)) {
    return true;
  }
  const distinctAppraisers = new Set(appraisals.map((appraisal) => appraisal.appraiserId));
  return distinctAppraisers.size >= 2;
}
