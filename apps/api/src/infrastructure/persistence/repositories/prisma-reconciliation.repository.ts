import { Inject, Injectable } from '@nestjs/common';
import type {
  LedgerSnapshot,
  ReconciliationRepository,
} from '../../../domain/operations/reconciliation-repository';
import type { ReconciliationRun } from '../../../domain/operations/reconciliation-run';
import type { UnitOfWorkContext } from '../../../domain/ports/unit-of-work';
import { ID_GENERATOR } from '../../../domain/shared/id-generator';
import type { IdGenerator } from '../../../domain/shared/id-generator';
import { receiptIdOf } from '../../../domain/shared/identifiers';
import type { ReceiptId, VaultId } from '../../../domain/shared/identifiers';
import { Money, currencyOf } from '../../../domain/shared/money';
import { transactionOf } from '../prisma-unit-of-work';

const aud = currencyOf('AUD');

@Injectable()
export class PrismaReconciliationRepository implements ReconciliationRepository {
  constructor(@Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator) {}

  async recordedReceiptIds(
    vaultId: VaultId,
    context: UnitOfWorkContext,
  ): Promise<readonly ReceiptId[]> {
    const rows = await transactionOf(context).custodyReceipt.findMany({
      where: { vaultId, status: { in: ['IN_VAULT', 'ENCUMBERED'] } },
      select: { id: true },
    });
    return rows.map((row) => receiptIdOf(row.id));
  }

  /* Balances were never stored, so the two sides are two ways of deriving
     the same number: the grouped query the application uses and a direct sum
     per account. */
  async ledgerSnapshot(context: UnitOfWorkContext): Promise<LedgerSnapshot> {
    const rows = await transactionOf(context).$queryRaw<
      { account_id: string; derived: bigint; entry_sum: bigint }[]
    >`
      SELECT a.id AS account_id,
             COALESCE(SUM(CASE WHEN e.direction = 'CREDIT' THEN e.minor_units ELSE -e.minor_units END), 0)::bigint AS derived,
             COALESCE((
               SELECT SUM(CASE WHEN e2.direction = 'CREDIT' THEN e2.minor_units ELSE -e2.minor_units END)
               FROM ledger_entry e2 WHERE e2.account_id = a.id
             ), 0)::bigint AS entry_sum
      FROM ledger_account a
      LEFT JOIN ledger_entry e ON e.account_id = a.id
      GROUP BY a.id
    `;
    const globalRows = await transactionOf(context).$queryRaw<{ total: bigint }[]>`
      SELECT COALESCE(SUM(CASE WHEN direction = 'CREDIT' THEN minor_units ELSE -minor_units END), 0)::bigint AS total
      FROM ledger_entry
    `;
    return {
      balances: rows.map((row) => ({
        ledgerAccountId: row.account_id,
        derivedBalance: Money.of(row.derived, aud),
        entrySum: Money.of(row.entry_sum, aud),
      })),
      globalSum: Money.of(globalRows[0]?.total ?? 0n, aud),
    };
  }

  async saveRun(run: ReconciliationRun, context: UnitOfWorkContext): Promise<void> {
    await transactionOf(context).reconciliationRun.create({
      data: {
        id: run.id,
        vaultId: run.vaultId,
        startedAt: new Date(Number(run.startedAt.epochMilliseconds)),
        drift: {
          create: run.drift.map((row) => ({
            id: this.idGenerator.generate(),
            kind: row.kind,
            subject: row.subject,
            field: row.field,
            expected: row.expected,
            observed: row.observed,
          })),
        },
      },
    });
  }
}
