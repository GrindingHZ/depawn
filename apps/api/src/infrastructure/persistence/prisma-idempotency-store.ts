import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  IdempotencyStore,
  StoredIdempotentResponse,
} from '../../domain/ports/idempotency-store.port';
import { ID_GENERATOR } from '../../domain/shared/id-generator';
import type { IdGenerator } from '../../domain/shared/id-generator';
import type { AccountId } from '../../domain/shared/identifiers';
import type { Instant } from '../../domain/shared/instant';
import { PrismaService } from './prisma.service';

@Injectable()
export class PrismaIdempotencyStore implements IdempotencyStore {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
  ) {}

  async find(
    key: string,
    accountId: AccountId,
    now: Instant,
  ): Promise<StoredIdempotentResponse | null> {
    const row = await this.prisma.idempotencyRecord.findUnique({
      where: { key_accountId: { key, accountId } },
    });
    if (row === null || row.expiresAt.getTime() <= Number(now.epochMilliseconds)) {
      return null;
    }
    return {
      requestHash: row.requestHash,
      statusCode: row.statusCode,
      responseBody: row.responseBody,
    };
  }

  async save(
    key: string,
    accountId: AccountId,
    record: StoredIdempotentResponse,
    expiresAt: Instant,
  ): Promise<void> {
    try {
      await this.prisma.idempotencyRecord.create({
        data: {
          id: this.idGenerator.generate(),
          key,
          accountId,
          requestHash: record.requestHash,
          statusCode: record.statusCode,
          responseBody: toJsonValue(record.responseBody),
          expiresAt: new Date(Number(expiresAt.epochMilliseconds)),
        },
      });
    } catch (error) {
      // Two racing requests with the same key both executed; the unique
      // constraint keeps one stored record and the loser's save is dropped.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return;
      }
      throw error;
    }
  }
}

function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
