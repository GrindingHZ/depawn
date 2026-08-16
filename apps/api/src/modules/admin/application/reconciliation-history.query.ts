import { Injectable } from '@nestjs/common';
import type { DriftRow } from '../../../domain/operations/reconciliation-run';
import { PrismaService } from '../../../infrastructure/persistence/prisma.service';

export interface ReconciliationRunReadModel {
  readonly id: string;
  readonly vaultId: string | null;
  readonly startedAt: string;
  readonly drift: readonly DriftRow[];
}

function isDriftKind(value: string): value is DriftRow['kind'] {
  return (
    value === 'MISSING_FROM_COUNT' ||
    value === 'MISSING_FROM_RECORDS' ||
    value === 'LEDGER_ACCOUNT_IMBALANCE' ||
    value === 'LEDGER_GLOBAL_IMBALANCE'
  );
}

@Injectable()
export class ReconciliationHistoryQuery {
  constructor(private readonly prisma: PrismaService) {}

  async latest(): Promise<ReconciliationRunReadModel | null> {
    const rows = await this.prisma.reconciliationRun.findMany({
      include: { drift: { orderBy: { id: 'asc' } } },
      orderBy: { id: 'desc' },
      take: 1,
    });
    const runs: ReconciliationRunReadModel[] = rows.map((row) => ({
      id: row.id,
      vaultId: row.vaultId,
      startedAt: row.startedAt.toISOString(),
      drift: row.drift
        .filter((entry) => isDriftKind(entry.kind))
        .map((entry) => ({
          kind: entry.kind as DriftRow['kind'],
          subject: entry.subject,
          field: entry.field,
          expected: entry.expected,
          observed: entry.observed,
        })),
    }));
    return runs[0] ?? null;
  }
}
