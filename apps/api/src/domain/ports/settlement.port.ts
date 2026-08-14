import type { AccountId, FundsHoldId } from '../shared/identifiers';
import type { Currency, Money } from '../shared/money';
import type { Distribution, SettlementRef } from '../shared/settlement-ref';
import type { UnitOfWorkContext } from './unit-of-work';

export interface HoldFundsCommand {
  readonly accountId: AccountId;
  readonly amount: Money;
  readonly reference: string;
}

export interface FundsHold {
  readonly id: FundsHoldId;
  readonly accountId: AccountId;
  readonly amount: Money;
  readonly settlementRef: SettlementRef;
}

export interface TransferCommand {
  readonly fromAccountId: AccountId;
  readonly toAccountId: AccountId;
  readonly amount: Money;
  readonly reference: string;
}

export interface SettlementPort {
  hold(command: HoldFundsCommand, unitOfWork: UnitOfWorkContext): Promise<FundsHold>;
  releaseHold(
    hold: FundsHold,
    distribution: Distribution[],
    unitOfWork: UnitOfWorkContext,
  ): Promise<SettlementRef>;
  refundHold(hold: FundsHold, unitOfWork: UnitOfWorkContext): Promise<SettlementRef>;
  transfer(command: TransferCommand, unitOfWork: UnitOfWorkContext): Promise<SettlementRef>;
  availableBalance(accountId: AccountId, currency: Currency): Promise<Money>;
}

export const SETTLEMENT_PORT = Symbol('SettlementPort');
