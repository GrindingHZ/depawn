import { Inject, Injectable } from '@nestjs/common';
import { AccountNotFound } from '../../../domain/accounts/account-not-found';
import { ACCOUNT_REPOSITORY } from '../../../domain/accounts/account-repository';
import type { AccountRepository } from '../../../domain/accounts/account-repository';
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

export interface DepositCommand {
  readonly requestedBy: AccountId;
  readonly targetEmail: string | undefined;
  readonly amount: Money;
}

@Injectable()
export class DepositUseCase {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    @Inject(ACCOUNT_REPOSITORY) private readonly accounts: AccountRepository,
    @Inject(SETTLEMENT_PORT) private readonly settlement: SettlementPort,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
  ) {}

  execute(command: DepositCommand): Promise<Result<SettlementRef, AccountNotFound>> {
    return this.unitOfWork.run(async (context) => {
      let targetAccountId = command.requestedBy;
      if (command.targetEmail !== undefined) {
        const target = await this.accounts.findByEmail(command.targetEmail, context);
        if (target === null) {
          return failure(new AccountNotFound());
        }
        targetAccountId = target.id;
      }

      const settlementRef = await this.settlement.transfer(
        {
          fromAccountId: platformAccountIds.float,
          toAccountId: targetAccountId,
          amount: command.amount,
          reference: this.idGenerator.generate(),
        },
        context,
      );
      return ok(settlementRef);
    });
  }
}
