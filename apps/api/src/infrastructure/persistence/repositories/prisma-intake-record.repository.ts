import { Injectable } from '@nestjs/common';
import type { IntakeRecord } from '../../../domain/custody/intake-record';
import type { IntakeRecordRepository } from '../../../domain/custody/intake-record-repository';
import type { UnitOfWorkContext } from '../../../domain/ports/unit-of-work';
import type { IntakeId, VaultId } from '../../../domain/shared/identifiers';
import { toIntakeRecord } from '../mappers/custody.mapper';
import { transactionOf } from '../prisma-unit-of-work';

export class StaleIntakeVersionError extends Error {
  constructor(intakeId: string) {
    super(`Intake record ${intakeId} was modified concurrently`);
    this.name = 'StaleIntakeVersionError';
  }
}

@Injectable()
export class PrismaIntakeRecordRepository implements IntakeRecordRepository {
  async findById(id: IntakeId, context: UnitOfWorkContext): Promise<IntakeRecord | null> {
    const row = await transactionOf(context).intakeRecord.findUnique({ where: { id } });
    return row === null ? null : toIntakeRecord(row);
  }

  async listByVault(
    vaultId: VaultId,
    context: UnitOfWorkContext,
  ): Promise<readonly IntakeRecord[]> {
    const rows = await transactionOf(context).intakeRecord.findMany({
      where: { vaultId },
      orderBy: { id: 'desc' },
    });
    return rows.map(toIntakeRecord);
  }

  async save(record: IntakeRecord, context: UnitOfWorkContext): Promise<void> {
    const transaction = transactionOf(context);
    const data = {
      vaultId: record.vaultId,
      borrowerAccountId: record.borrowerAccountId,
      itemCategory: record.itemCategory,
      itemDescription: record.itemDescription,
      serialNumbers: [...record.serialNumbers],
      sealNumber: record.sealNumber,
      evidence: record.evidence.map((item) => ({
        label: item.label,
        contentHash: item.contentHash,
        ...(item.contentType === undefined ? {} : { contentType: item.contentType }),
        ...(item.byteLength === undefined ? {} : { byteLength: item.byteLength }),
      })),
      status: record.status,
      sealedHash: record.sealedHash,
    };
    const existing = await transaction.intakeRecord.findUnique({ where: { id: record.id } });
    if (existing === null) {
      await transaction.intakeRecord.create({ data: { id: record.id, ...data, version: 0 } });
      return;
    }
    const updated = await transaction.intakeRecord.updateMany({
      where: { id: record.id, version: record.version },
      data: { ...data, version: record.version + 1 },
    });
    if (updated.count === 0) {
      throw new StaleIntakeVersionError(record.id);
    }
  }
}
