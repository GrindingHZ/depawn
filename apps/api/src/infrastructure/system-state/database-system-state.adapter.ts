import { Injectable } from '@nestjs/common';
import type {
  PauseCommand,
  SystemState,
  SystemStatePort,
} from '../../domain/ports/system-state.port';
import type { UnitOfWorkContext } from '../../domain/ports/unit-of-work';
import { accountIdOf } from '../../domain/shared/identifiers';
import { Instant } from '../../domain/shared/instant';
import { transactionOf } from '../persistence/prisma-unit-of-work';

/* The single row is created on first read rather than by a seed, so a fresh
   database and a migrated one behave the same. */
const singletonId = 'SYSTEM';

const running: SystemState = {
  isPaused: false,
  pausedAt: null,
  pausedByAccountId: null,
  reason: null,
};

@Injectable()
export class DatabaseSystemStateAdapter implements SystemStatePort {
  async read(context: UnitOfWorkContext): Promise<SystemState> {
    const row = await transactionOf(context).systemState.findUnique({ where: { id: singletonId } });
    if (row === null || row.pausedAt === null) {
      return running;
    }
    return {
      isPaused: true,
      pausedAt: Instant.fromEpochMilliseconds(BigInt(row.pausedAt.getTime())),
      pausedByAccountId: row.pausedByAccountId === null ? null : accountIdOf(row.pausedByAccountId),
      reason: row.reason,
    };
  }

  async pause(command: PauseCommand, context: UnitOfWorkContext): Promise<SystemState> {
    const pausedAt = new Date(Number(command.at.epochMilliseconds));
    const row = {
      pausedAt,
      pausedByAccountId: command.pausedBy,
      reason: command.reason,
    };
    await transactionOf(context).systemState.upsert({
      where: { id: singletonId },
      update: row,
      create: { id: singletonId, ...row },
    });
    return {
      isPaused: true,
      pausedAt: command.at,
      pausedByAccountId: command.pausedBy,
      reason: command.reason,
    };
  }

  async unpause(context: UnitOfWorkContext): Promise<SystemState> {
    await transactionOf(context).systemState.upsert({
      where: { id: singletonId },
      update: { pausedAt: null, pausedByAccountId: null, reason: null },
      create: { id: singletonId, pausedAt: null, pausedByAccountId: null, reason: null },
    });
    return running;
  }
}
