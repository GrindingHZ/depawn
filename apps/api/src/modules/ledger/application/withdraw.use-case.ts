import { Inject, Injectable } from '@nestjs/common';
import { InsufficientFunds } from '../../../domain/ledger/insufficient-funds';
import { platformAccountIds } from '../../../domain/ledger/platform-accounts';
import { SETTLEMENT_PORT } from '../../../domain/ports/settlement.port';
import type { SettlementPort } from '../../../domain/ports/settlement.port';
import { UNIT_OF_WORK } from '../../../domain/ports/unit-of-work';
import type { UnitOfWork } from '../../../domain/ports/unit-of-work';
import { ID_GENERATOR } from '../../../domain/shared/id-generator';
import type { IdGenerator } from '../../../domain/shared/id-generator';
import type { AccountId } from '../../../domain/shared/identifiers';
import type { Money } from '../../../domain/shared/money';
import { failure, ok } from '../../../domain/shared/result';
import type { Result } from '../../../domain/shared/result';
import type { SettlementRef } from '../../../domain/shared/settlement-ref';

export interface WithdrawCommand {
  readonly accountId: AccountId;
  readonly amount: Money;
}

@Injectable()
export class WithdrawUseCase {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    @Inject(SETTLEMENT_PORT) private readonly settlement: SettlementPort,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
  ) {}

  execute(command: WithdrawCommand): Promise<Result<SettlementRef, InsufficientFunds>> {
    return this.unitOfWork.run(async (context) => {
      try {
        const settlementRef = await this.settlement.transfer(
          {
            fromAccountId: command.accountId,
            toAccountId: platformAccountIds.float,
            amount: command.amount,
            reference: this.idGenerator.generate(),
          },
          context,
        );
        return ok(settlementRef);
      } catch (error) {
        if (error instanceof InsufficientFunds) {
          return failure(error);
        }
        throw error;
      }
    });
  }
}
