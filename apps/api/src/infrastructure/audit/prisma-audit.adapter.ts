import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CLOCK_PORT } from '../../domain/ports/clock.port';
import type { ClockPort } from '../../domain/ports/clock.port';
import type { AuditEntry, AuditPort } from '../../domain/ports/audit.port';
import type { UnitOfWorkContext } from '../../domain/ports/unit-of-work';
import { ID_GENERATOR } from '../../domain/shared/id-generator';
import type { IdGenerator } from '../../domain/shared/id-generator';
import { transactionOf } from '../persistence/prisma-unit-of-work';

@Injectable()
export class PrismaAuditAdapter implements AuditPort {
  constructor(
    @Inject(CLOCK_PORT) private readonly clock: ClockPort,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
  ) {}

  async record(entry: AuditEntry, context: UnitOfWorkContext): Promise<void> {
    await transactionOf(context).auditLog.create({
      data: {
        id: this.idGenerator.generate(),
        actorType: entry.actorType,
        actorId: entry.actorId,
        subjectType: entry.subjectType,
        subjectId: entry.subjectId,
        action: entry.action,
        before: toJson(entry.before),
        after: toJson(entry.after),
        occurredAt: new Date(Number(this.clock.now().epochMilliseconds)),
      },
    });
  }
}

function toJson(value: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  if (value === undefined || value === null) {
    return Prisma.JsonNull;
  }
  return JSON.parse(
    JSON.stringify(value, (_key, raw: unknown) => (typeof raw === 'bigint' ? raw.toString() : raw)),
  ) as Prisma.InputJsonValue;
}
