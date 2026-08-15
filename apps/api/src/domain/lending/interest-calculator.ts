import type { Instant } from '../shared/instant';
import { Money } from '../shared/money';

/* A year is 365 days by convention, fixed once here so no caller has to
   choose (docs/02-domain-model.md). */
export const MILLISECONDS_PER_YEAR = 365n * 24n * 60n * 60n * 1000n;

function clampElapsed(startedAt: Instant, maturesAt: Instant, now: Instant): bigint {
  // Interest stops at maturity (rule L1), and a clock that somehow reads
  // before origination accrues nothing rather than a negative amount.
  if (now.isBefore(startedAt)) {
    return 0n;
  }
  const end = now.isAfter(maturesAt) ? maturesAt : now;
  return end.millisecondsSince(startedAt);
}

/* bigint throughout: principal times rate times elapsed overflows 64 bits
   within days at realistic values. The division truncates, which rounds in
   the borrower's favour, and that direction is deliberate. */
export function calculateAccruedInterest(
  principal: Money,
  annualPercentageRateBasisPoints: number,
  startedAt: Instant,
  maturesAt: Instant,
  now: Instant,
): Money {
  if (!Number.isInteger(annualPercentageRateBasisPoints) || annualPercentageRateBasisPoints < 0) {
    throw new RangeError(
      `Basis points must be a non-negative integer, got ${annualPercentageRateBasisPoints}`,
    );
  }
  const elapsed = clampElapsed(startedAt, maturesAt, now);
  const numerator = principal.minorUnits * BigInt(annualPercentageRateBasisPoints) * elapsed;
  const denominator = 10_000n * MILLISECONDS_PER_YEAR;
  return Money.of(numerator / denominator, principal.currency);
}
