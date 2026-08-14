import { Injectable } from '@nestjs/common';
import type { Account } from '../../../domain/accounts/account';
import type { AccountRepository } from '../../../domain/accounts/account-repository';
import type { AccountId } from '../../../domain/shared/identifiers';
import type { UnitOfWorkContext } from '../../../domain/ports/unit-of-work';
import { toAccount, toAccountRow } from '../mappers/account.mapper';
import { transactionOf } from '../prisma-unit-of-work';

export class StaleAccountVersionError extends Error {
  constructor(accountId: string) {
    super(`Account ${accountId} was modified concurrently`);
    this.name = 'StaleAccountVersionError';
  }
}

@Injectable()
export class PrismaAccountRepository implements AccountRepository {
  async findById(id: AccountId, context: UnitOfWorkContext): Promise<Account | null> {
    const row = await transactionOf(context).account.findUnique({ where: { id } });
    return row === null ? null : toAccount(row);
  }

  async findByEmail(email: string, context: UnitOfWorkContext): Promise<Account | null> {
    const row = await transactionOf(context).account.findUnique({
      where: { email: email.toLowerCase() },
    });
    return row === null ? null : toAccount(row);
  }

  async save(account: Account, context: UnitOfWorkContext): Promise<void> {
    const transaction = transactionOf(context);
    const row = toAccountRow(account);
    const existing = await transaction.account.findUnique({ where: { id: row.id } });

    if (existing === null) {
      await transaction.account.create({ data: row });
      return;
    }

    const updated = await transaction.account.updateMany({
      where: { id: row.id, version: row.version },
      data: { ...row, version: row.version + 1 },
    });
    if (updated.count === 0) {
      throw new StaleAccountVersionError(row.id);
    }
  }
}
