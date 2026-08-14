import type { MoneyDto, SettlementRefDto } from '@depawn/contracts';
import { Money, currencyOf } from '../../../domain/shared/money';
import type { SettlementRef } from '../../../domain/shared/settlement-ref';

export function toMoneyDto(money: Money): MoneyDto {
  return { minorUnits: money.minorUnits.toString(), currency: money.currency };
}

export function toMoney(dto: MoneyDto): Money {
  return Money.of(BigInt(dto.minorUnits), currencyOf(dto.currency));
}

export function toSettlementRefDto(settlementRef: SettlementRef): SettlementRefDto {
  return {
    kind: settlementRef.kind,
    reference: settlementRef.reference,
    settledAt: new Date(Number(settlementRef.settledAt.epochMilliseconds)).toISOString(),
  };
}
