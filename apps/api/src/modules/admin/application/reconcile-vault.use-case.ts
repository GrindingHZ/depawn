import { Inject, Injectable } from '@nestjs/common';
import { RECONCILIATION_REPOSITORY } from '../../../domain/operations/reconciliation-repository';
import type { ReconciliationRepository } from '../../../domain/operations/reconciliation-repository';
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
import type { UnitOfWork } from '../../../domain/ports/unit-of-work';
import { ID_GENERATOR } from '../../../domain/shared/id-generator';
import type { IdGenerator } from '../../../domain/shared/id-generator';
import { reconciliationRunIdOf } from '../../../domain/shared/identifiers';
import type { AccountId, ReceiptId, VaultId } from '../../../domain/shared/identifiers';

export interface ReconcileVaultCommand {
  readonly vaultId: VaultId;
  readonly countedReceiptIds: readonly ReceiptId[];
  readonly requestedBy: AccountId;
}

/* Flow 10. One run compares the operator's physical count against the
   records, then checks the ledger against itself, and writes a row for every
   disagreement. The comparisons are pure functions; this reads the two sides
   through the port and stores the verdict. */
@Injectable()
export class ReconcileVaultUseCase {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    @Inject(RECONCILIATION_REPOSITORY)
    private readonly reconciliation: ReconciliationRepository,
    @Inject(AUDIT_PORT) private readonly audit: AuditPort,
    @Inject(CLOCK_PORT) private readonly clock: ClockPort,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
  ) {}

  execute(command: ReconcileVaultCommand): Promise<ReconciliationRun> {
    return this.unitOfWork.run(async (context) => {
      const startedAt = this.clock.now();
      const recorded = await this.reconciliation.recordedReceiptIds(command.vaultId, context);
      const ledger = await this.reconciliation.ledgerSnapshot(context);

      const drift: DriftRow[] = [
        ...detectInventoryDrift(
          { vaultId: command.vaultId, countedReceiptIds: command.countedReceiptIds },
          { vaultId: command.vaultId, receiptIds: recorded },
        ),
        ...detectLedgerDrift(ledger.transactions, ledger.globalSum),
      ];

      const run: ReconciliationRun = {
        id: reconciliationRunIdOf(this.idGenerator.generate()),
        vaultId: command.vaultId,
        startedAt,
        drift,
      };
      await this.reconciliation.saveRun(run, context);
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
}
