import type { ItemCategory } from '../../domain/custody/item-category';
import type { ProtocolParameters } from '../../domain/marketplace/protocol-parameters';
import type { ProtocolParameterVersion } from '../../domain/ports/protocol-parameters.port';
import type { Instant } from '../../domain/shared/instant';
import { Money, currencyOf } from '../../domain/shared/money';

export type ParameterVersion = ProtocolParameterVersion;

/* Stored as JSON, so bigints and Money have to be written and read back
   deliberately rather than trusted to survive the round trip. */
export interface StoredParameters {
  readonly maxLoanToValueBasisPointsByCategory: Record<string, number>;
  readonly maxAnnualPercentageRateBasisPoints: number;
  readonly minimumOfferLifetimeMs: string;
  readonly originationFeeBasisPoints: number;
  readonly liquidationFeeBasisPoints: number;
  readonly gracePeriodMs: string;
  readonly statutoryHoldingPeriodMs: string;
  readonly dualAppraisalThresholdMinorUnits: string;
  /* Written from P7 onwards. Rows stored before it existed carry no
     currency, and Phase 1 has only ever had one, so reading falls back to
     AUD rather than refusing a row that was correct when it was written. */
  readonly dualAppraisalThresholdCurrency?: string;
  readonly notesTransferable: boolean;
}

export function toStoredParameters(parameters: ProtocolParameters): StoredParameters {
  return {
    maxLoanToValueBasisPointsByCategory: { ...parameters.maxLoanToValueBasisPointsByCategory },
    maxAnnualPercentageRateBasisPoints: parameters.maxAnnualPercentageRateBasisPoints,
    minimumOfferLifetimeMs: parameters.minimumOfferLifetimeMs.toString(),
    originationFeeBasisPoints: parameters.originationFeeBasisPoints,
    liquidationFeeBasisPoints: parameters.liquidationFeeBasisPoints,
    gracePeriodMs: parameters.gracePeriodMs.toString(),
    statutoryHoldingPeriodMs: parameters.statutoryHoldingPeriodMs.toString(),
    dualAppraisalThresholdMinorUnits: parameters.dualAppraisalThreshold.minorUnits.toString(),
    dualAppraisalThresholdCurrency: parameters.dualAppraisalThreshold.currency,
    notesTransferable: parameters.notesTransferable,
  };
}

export function fromStoredParameters(stored: StoredParameters): ProtocolParameters {
  return {
    maxLoanToValueBasisPointsByCategory: stored.maxLoanToValueBasisPointsByCategory as Record<
      ItemCategory,
      number
    >,
    maxAnnualPercentageRateBasisPoints: stored.maxAnnualPercentageRateBasisPoints,
    minimumOfferLifetimeMs: BigInt(stored.minimumOfferLifetimeMs),
    originationFeeBasisPoints: stored.originationFeeBasisPoints,
    liquidationFeeBasisPoints: stored.liquidationFeeBasisPoints,
    gracePeriodMs: BigInt(stored.gracePeriodMs),
    statutoryHoldingPeriodMs: BigInt(stored.statutoryHoldingPeriodMs),
    dualAppraisalThreshold: Money.of(
      BigInt(stored.dualAppraisalThresholdMinorUnits),
      currencyOf(stored.dualAppraisalThresholdCurrency ?? 'AUD'),
    ),
    notesTransferable: stored.notesTransferable,
  };
}

/* The version in force is the newest one whose effective instant has passed.
   A version dated in the future is stored and waits; nothing reads it early,
   which is the whole point of an effective date. */
export function versionInForce(
  versions: readonly ParameterVersion[],
  now: Instant,
  fallback: ProtocolParameters,
): ProtocolParameters {
  const applicable = versions
    .filter((version) => !version.effectiveAt.isAfter(now))
    .sort((left, right) =>
      left.effectiveAt.isBefore(right.effectiveAt)
        ? -1
        : left.effectiveAt.isAfter(right.effectiveAt)
          ? 1
          : 0,
    );
  return applicable.at(-1)?.parameters ?? fallback;
}
