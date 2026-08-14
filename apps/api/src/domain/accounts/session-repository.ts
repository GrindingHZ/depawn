import type { UnitOfWorkContext } from '../ports/unit-of-work';
import type { Session } from './session';

export interface SessionRepository {
  findByTokenHash(tokenHash: string, context: UnitOfWorkContext): Promise<Session | null>;
  save(session: Session, context: UnitOfWorkContext): Promise<void>;
  deleteByTokenHash(tokenHash: string, context: UnitOfWorkContext): Promise<void>;
}

export const SESSION_REPOSITORY = Symbol('SessionRepository');
