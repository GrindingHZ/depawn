import type { AccountId } from '../shared/identifiers';
import type { Instant } from '../shared/instant';
import type { UnitOfWorkContext } from './unit-of-work';

export interface SystemState {
  readonly isPaused: boolean;
  readonly pausedAt: Instant | null;
  readonly pausedByAccountId: AccountId | null;
  readonly reason: string | null;
}

export interface PauseCommand {
  readonly pausedBy: AccountId;
  readonly reason: string;
  readonly at: Instant;
}

/* Whether the system is accepting new business is a domain question, not an
   HTTP one: rule S2 names the flows a pause may never block, and that list
   has to be readable in the same layer as the flows themselves. Phase 3
   answers it from a shared Config object instead of a row. */
export interface SystemStatePort {
  read(unitOfWork: UnitOfWorkContext): Promise<SystemState>;
  pause(command: PauseCommand, unitOfWork: UnitOfWorkContext): Promise<SystemState>;
  unpause(unitOfWork: UnitOfWorkContext): Promise<SystemState>;
}

export const SYSTEM_STATE_PORT = Symbol('SystemStatePort');
