import type { UnitOfWorkContext } from './unit-of-work';

export interface AuditEntry {
  readonly actorType: 'ACCOUNT' | 'SYSTEM';
  readonly actorId: string;
  readonly subjectType: string;
  readonly subjectId: string;
  readonly action: string;
  readonly before?: unknown;
  readonly after?: unknown;
}

/* Every state transition gets an audit entry in the same transaction
   (docs/09-conventions.md). It is the record needed on the one day it
   matters. */
export interface AuditPort {
  record(entry: AuditEntry, context: UnitOfWorkContext): Promise<void>;
}

export const AUDIT_PORT = Symbol('AuditPort');
