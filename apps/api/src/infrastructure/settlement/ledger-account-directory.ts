import { Inject, Injectable } from '@nestjs/common';
import type { LedgerAccountPurpose } from '../../domain/ledger/ledger-account';
import { platformPurposeOf } from '../../domain/ledger/platform-accounts';
import type { UnitOfWorkContext } from '../../domain/ports/unit-of-work';
import { ID_GENERATOR } from '../../domain/shared/id-generator';
import type { IdGenerator } from '../../domain/shared/id-generator';
import { ledgerAccountIdOf } from '../../domain/shared/identifiers';
import type { AccountId, LedgerAccountId } from '../../domain/shared/identifiers';
import type { Currency } from '../../domain/shared/money';
import { transactionOf } from '../persistence/prisma-unit-of-work';

/* Resolves an account id from a command or distribution to a ledger account
   row, creating it on first use. Platform sentinels map to the platform
   accounts in the chart; everything else is a user account. */
@Injectable()
export class LedgerAccountDirectory {
  constructor(@Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator) {}

  async resolve(
    accountId: AccountId,
    purpose: 'USER_AVAILABLE' | 'USER_HELD',
    currency: Currency,
    context: UnitOfWorkContext,
  ): Promise<LedgerAccountId> {
    const platformPurpose = platformPurposeOf(accountId);
    if (platformPurpose !== null) {
      return this.findOrCreate('PLATFORM', null, platformPurpose, currency, context);
    }
    return this.findOrCreate('USER', accountId, purpose, currency, context);
  }

  private async findOrCreate(
    ownerType: 'USER' | 'PLATFORM',
    ownerId: AccountId | null,
    purpose: LedgerAccountPurpose,
    currency: Currency,
    context: UnitOfWorkContext,
  ): Promise<LedgerAccountId> {
    const transaction = transactionOf(context);
    const existing = await transaction.ledgerAccount.findFirst({
      where: { ownerType, ownerId, purpose, currency },
    });
    if (existing !== null) {
      return ledgerAccountIdOf(existing.id);
    }
    const created = await transaction.ledgerAccount.create({
      data: { id: this.idGenerator.generate(), ownerType, ownerId, purpose, currency },
    });
    return ledgerAccountIdOf(created.id);
  }

  /* Serialises concurrent balance reads against the same account. Postgres
     row locks are the Phase 1 stand-in for shared object consensus ordering. */
  async lock(ledgerAccountId: LedgerAccountId, context: UnitOfWorkContext): Promise<void> {
    await transactionOf(context).$queryRaw`
      SELECT id FROM ledger_account WHERE id = ${ledgerAccountId} FOR UPDATE
    `;
  }

  async balanceOf(ledgerAccountId: LedgerAccountId, context: UnitOfWorkContext): Promise<bigint> {
    const rows = await transactionOf(context).$queryRaw<{ balance: bigint }[]>`
      SELECT COALESCE(SUM(CASE WHEN direction = 'CREDIT' THEN minor_units ELSE -minor_units END), 0)::bigint AS balance
      FROM ledger_entry
      WHERE account_id = ${ledgerAccountId}
    `;
    return rows[0]?.balance ?? 0n;
  }
}
