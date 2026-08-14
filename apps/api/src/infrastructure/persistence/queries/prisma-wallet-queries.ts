import { Injectable } from '@nestjs/common';
import type { EntryDirection } from '../../../domain/ledger/ledger-entry';
import type { LedgerTransactionKind } from '../../../domain/ledger/ledger-transaction';
import type {
  WalletBalance,
  WalletEntriesPage,
  WalletLedgerEntry,
  WalletQueries,
} from '../../../domain/ports/wallet-queries.port';
import type { AccountId } from '../../../domain/shared/identifiers';
import { Instant } from '../../../domain/shared/instant';
import { Money, currencyOf } from '../../../domain/shared/money';
import type { Currency } from '../../../domain/shared/money';
import { PrismaService } from '../prisma.service';

interface EntryRow {
  readonly id: string;
  readonly kind: LedgerTransactionKind;
  readonly direction: EntryDirection;
  readonly purpose: 'USER_AVAILABLE' | 'USER_HELD';
  readonly minor_units: bigint;
  readonly currency: string;
  readonly occurred_at: Date;
  readonly reference: string;
}

@Injectable()
export class PrismaWalletQueries implements WalletQueries {
  constructor(private readonly prisma: PrismaService) {}

  async balanceOf(accountId: AccountId, currency: Currency): Promise<WalletBalance> {
    const rows = await this.prisma.$queryRaw<{ purpose: string; balance: bigint }[]>`
      SELECT a.purpose,
             COALESCE(SUM(CASE WHEN e.direction = 'CREDIT' THEN e.minor_units ELSE -e.minor_units END), 0)::bigint AS balance
      FROM ledger_account a
      LEFT JOIN ledger_entry e ON e.account_id = a.id
      WHERE a.owner_id = ${accountId} AND a.currency = ${currency}
      GROUP BY a.purpose
    `;
    const byPurpose = new Map(rows.map((row) => [row.purpose, row.balance]));
    return {
      available: Money.of(byPurpose.get('USER_AVAILABLE') ?? 0n, currency),
      held: Money.of(byPurpose.get('USER_HELD') ?? 0n, currency),
    };
  }

  async ledgerEntriesOf(
    accountId: AccountId,
    cursor: string | null,
    limit: number,
  ): Promise<WalletEntriesPage> {
    const rows = await this.prisma.$queryRaw<EntryRow[]>`
      SELECT e.id, t.kind, e.direction, a.purpose, e.minor_units, e.currency,
             t.occurred_at, t.reference
      FROM ledger_entry e
      JOIN ledger_account a ON a.id = e.account_id
      JOIN ledger_transaction t ON t.id = e.transaction_id
      WHERE a.owner_id = ${accountId}
        AND (${cursor}::text IS NULL OR e.id < ${cursor})
      ORDER BY e.id DESC
      LIMIT ${limit + 1}
    `;

    const page = rows.slice(0, limit);
    const items: WalletLedgerEntry[] = page.map((row) => ({
      id: row.id,
      kind: row.kind,
      direction: row.direction,
      purpose: row.purpose,
      amount: Money.of(row.minor_units, currencyOf(row.currency)),
      occurredAt: Instant.fromEpochMilliseconds(BigInt(row.occurred_at.getTime())),
      reference: row.reference,
    }));

    return {
      items,
      nextCursor: rows.length > limit ? (page[page.length - 1]?.id ?? null) : null,
    };
  }
}
