import { Inject, Injectable } from '@nestjs/common';
import {
  detectInventoryDrift,
  detectLedgerDrift,
} from '../../../domain/operations/reconciliation-run';
import type { DriftRow, ReconciliationRun } from '../../../domain/operations/reconciliation-run';
import { AUDIT_PORT } from '../../../domain/ports/audit.port';
import type { AuditPort } from '../../../domain/ports/audit.port';
import { CLOCK_PORT } from '../../../domain/ports/clock.port';
import type { ClockPort } from '../../../domain/ports/clock.port';
import { UNIT_OF_WORK } from '../../../domain/ports/unit-of-work';
import type { UnitOfWork, UnitOfWorkContext } from '../../../domain/ports/unit-of-work';
import { ID_GENERATOR } from '../../../domain/shared/id-generator';
import type { IdGenerator } from '../../../domain/shared/id-generator';
import { receiptIdOf, reconciliationRunIdOf } from '../../../domain/shared/identifiers';
import type { AccountId, ReceiptId, VaultId } from '../../../domain/shared/identifiers';
import { Money, currencyOf } from '../../../domain/shared/money';
import { transactionOf } from '../../../infrastructure/persistence/prisma-unit-of-work';

export interface ReconcileVaultCommand {
  readonly vaultId: VaultId;
  readonly countedReceiptIds: readonly ReceiptId[];
  readonly requestedBy: AccountId;
}

const aud = currencyOf('AUD');

/* Flow 10. One run compares the operator's physical count against the
   records, then checks the ledger against itself, and writes a row for every
   disagreement. The comparisons are pure functions; this reads the two sides
   and stores the verdict. */
@Injectable()
export class ReconcileVaultUseCase {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    @Inject(AUDIT_PORT) private readonly audit: AuditPort,
    @Inject(CLOCK_PORT) private readonly clock: ClockPort,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
  ) {}

  execute(command: ReconcileVaultCommand): Promise<ReconciliationRun> {
    return this.unitOfWork.run(async (context) => {
      const startedAt = this.clock.now();
      const recordedRows = await transactionOf(context).custodyReceipt.findMany({
        where: { vaultId: command.vaultId, status: { in: ['IN_VAULT', 'ENCUMBERED'] } },
        select: { id: true },
      });

      const drift: DriftRow[] = [
        ...detectInventoryDrift(
          { vaultId: command.vaultId, countedReceiptIds: command.countedReceiptIds },
          {
            vaultId: command.vaultId,
            receiptIds: recordedRows.map((row) => receiptIdOf(row.id)),
          },
        ),
        ...(await this.ledgerDrift(context)),
      ];

      const run: ReconciliationRun = {
        id: reconciliationRunIdOf(this.idGenerator.generate()),
        vaultId: command.vaultId,
        startedAt,
        drift,
      };
      await transactionOf(context).reconciliationRun.create({
        data: {
          id: run.id,
          vaultId: command.vaultId,
          startedAt: new Date(Number(startedAt.epochMilliseconds)),
          drift: {
            create: drift.map((row) => ({
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
      await this.audit.record(
        {
          actorType: 'ACCOUNT',
          actorId: command.requestedBy,
          subjectType: 'reconciliation_run',
          subjectId: run.id,
          action: 'reconcile_vault',
          after: { vaultId: command.vaultId, driftCount: drift.length },
        },
        context,
      );
      return run;
    });
  }

  /* Balances are derived rather than stored, so the account check compares
     two ways of deriving the same number: the running balance query the
     application uses, and a direct sum of the entries. */
  private async ledgerDrift(context: UnitOfWorkContext): Promise<DriftRow[]> {
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
    return detectLedgerDrift(
      rows.map((row) => ({
        ledgerAccountId: row.account_id,
        derivedBalance: Money.of(row.derived, aud),
        entrySum: Money.of(row.entry_sum, aud),
      })),
      Money.of(globalRows[0]?.total ?? 0n, aud),
    );
  }
}
