import { Injectable } from '@nestjs/common';
import type { Session } from '../../../domain/accounts/session';
import type { SessionRepository } from '../../../domain/accounts/session-repository';
import type { UnitOfWorkContext } from '../../../domain/ports/unit-of-work';
import { toSession, toSessionRow } from '../mappers/session.mapper';
import { transactionOf } from '../prisma-unit-of-work';

@Injectable()
export class PrismaSessionRepository implements SessionRepository {
  async findByTokenHash(tokenHash: string, context: UnitOfWorkContext): Promise<Session | null> {
    const row = await transactionOf(context).session.findUnique({ where: { tokenHash } });
    return row === null ? null : toSession(row);
  }

  async save(session: Session, context: UnitOfWorkContext): Promise<void> {
    await transactionOf(context).session.create({ data: toSessionRow(session) });
  }

  async deleteByTokenHash(tokenHash: string, context: UnitOfWorkContext): Promise<void> {
    await transactionOf(context).session.deleteMany({ where: { tokenHash } });
  }
}
