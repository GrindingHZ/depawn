import type { ProtocolParametersDto } from '@depawn/contracts';
import type { ItemCategory } from '../../../domain/custody/item-category';
import type { ProtocolParameters } from '../../../domain/marketplace/protocol-parameters';
import { Money, currencyOf } from '../../../domain/shared/money';
import { toMoney, toMoneyDto } from '../../shared/http/money.mapper';

/* Milliseconds cross the wire as numbers because a duration in days is not
   money and never needs more than a double; amounts stay in minor units. */
export function toParametersDto(parameters: ProtocolParameters): ProtocolParametersDto {
  return {
    maxLoanToValueBasisPointsByCategory: { ...parameters.maxLoanToValueBasisPointsByCategory },
    maxAnnualPercentageRateBasisPoints: parameters.maxAnnualPercentageRateBasisPoints,
    minimumOfferLifetimeMs: Number(parameters.minimumOfferLifetimeMs),
    originationFeeBasisPoints: parameters.originationFeeBasisPoints,
    liquidationFeeBasisPoints: parameters.liquidationFeeBasisPoints,
    gracePeriodMs: Number(parameters.gracePeriodMs),
    statutoryHoldingPeriodMs: Number(parameters.statutoryHoldingPeriodMs),
    dualAppraisalThreshold: toMoneyDto(parameters.dualAppraisalThreshold),
    notesTransferable: parameters.notesTransferable,
  };
}

export function fromParametersDto(dto: ProtocolParametersDto): ProtocolParameters {
  const threshold =
    dto.dualAppraisalThreshold.currency === 'AUD'
      ? toMoney({ minorUnits: dto.dualAppraisalThreshold.minorUnits, currency: 'AUD' })
      : Money.of(
          BigInt(dto.dualAppraisalThreshold.minorUnits),
          currencyOf(dto.dualAppraisalThreshold.currency),
        );
  return {
    maxLoanToValueBasisPointsByCategory: dto.maxLoanToValueBasisPointsByCategory as Record<
      ItemCategory,
      number
    >,
    maxAnnualPercentageRateBasisPoints: dto.maxAnnualPercentageRateBasisPoints,
    minimumOfferLifetimeMs: BigInt(dto.minimumOfferLifetimeMs),
    originationFeeBasisPoints: dto.originationFeeBasisPoints,
    liquidationFeeBasisPoints: dto.liquidationFeeBasisPoints,
    gracePeriodMs: BigInt(dto.gracePeriodMs),
    statutoryHoldingPeriodMs: BigInt(dto.statutoryHoldingPeriodMs),
    dualAppraisalThreshold: threshold,
    notesTransferable: dto.notesTransferable,
  };
}
