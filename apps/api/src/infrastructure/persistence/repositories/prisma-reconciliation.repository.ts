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

  /* Two checks that can actually fail: every transaction's entries net to
     zero, and the ledger as a whole nets to zero. Comparing an account's
     balance against a sum of the same entries would compare a number with
     itself. */
  async ledgerSnapshot(context: UnitOfWorkContext): Promise<LedgerSnapshot> {
    const rows = await transactionOf(context).$queryRaw<{ transaction_id: string; net: bigint }[]>`
      SELECT t.id AS transaction_id,
             COALESCE(SUM(CASE WHEN e.direction = 'CREDIT' THEN e.minor_units ELSE -e.minor_units END), 0)::bigint AS net
      FROM ledger_transaction t
      LEFT JOIN ledger_entry e ON e.transaction_id = t.id
      GROUP BY t.id
      HAVING COALESCE(SUM(CASE WHEN e.direction = 'CREDIT' THEN e.minor_units ELSE -e.minor_units END), 0) <> 0
    `;
    const globalRows = await transactionOf(context).$queryRaw<{ total: bigint }[]>`
      SELECT COALESCE(SUM(CASE WHEN direction = 'CREDIT' THEN minor_units ELSE -minor_units END), 0)::bigint AS total
      FROM ledger_entry
    `;
    return {
      transactions: rows.map((row) => ({
        ledgerTransactionId: row.transaction_id,
        net: Money.of(row.net, aud),
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
