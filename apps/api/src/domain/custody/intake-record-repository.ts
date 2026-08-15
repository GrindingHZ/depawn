import type { IntakeId, VaultId } from '../shared/identifiers';
import type { UnitOfWorkContext } from '../ports/unit-of-work';
import type { IntakeRecord } from './intake-record';

export interface IntakeRecordRepository {
  findById(id: IntakeId, context: UnitOfWorkContext): Promise<IntakeRecord | null>;
  listByVault(vaultId: VaultId, context: UnitOfWorkContext): Promise<readonly IntakeRecord[]>;
  save(record: IntakeRecord, context: UnitOfWorkContext): Promise<void>;
}

export const INTAKE_RECORD_REPOSITORY = Symbol('IntakeRecordRepository');
