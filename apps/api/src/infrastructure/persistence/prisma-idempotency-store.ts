import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  IdempotencyClaim,
  IdempotencyStore,
  StoredIdempotentResponse,
} from '../../domain/ports/idempotency-store.port';
import { ID_GENERATOR } from '../../domain/shared/id-generator';
import type { IdGenerator } from '../../domain/shared/id-generator';
import type { AccountId } from '../../domain/shared/identifiers';
import type { Instant } from '../../domain/shared/instant';
import { PrismaService } from './prisma.service';

/* A pending reservation carries status code zero; completion overwrites it
   with the real status and body. */
const pendingStatusCode = 0;

@Injectable()
export class PrismaIdempotencyStore implements IdempotencyStore {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
  ) {}

  async claim(
    key: string,
    accountId: AccountId,
    requestHash: string,
    now: Instant,
    expiresAt: Instant,
  ): Promise<IdempotencyClaim> {
    const inserted = await this.prisma.$executeRaw`
      INSERT INTO idempotency_record
        (id, key, account_id, request_hash, status_code, response_body, expires_at, created_at, updated_at)
      VALUES
        (${this.idGenerator.generate()}, ${key}, ${accountId}, ${requestHash},
         ${pendingStatusCode}, 'null'::jsonb, ${new Date(Number(expiresAt.epochMilliseconds))}, now(), now())
      ON CONFLICT (key, account_id) DO NOTHING
    `;
    if (inserted === 1) {
      return { outcome: 'claimed' };
    }

    const existing = await this.prisma.idempotencyRecord.findUnique({
      where: { key_accountId: { key, accountId } },
    });
    if (existing === null) {
      // The competing row expired and was removed between the insert and the
      // read; one recursive retry claims it cleanly.
      return this.claim(key, accountId, requestHash, now, expiresAt);
    }
    if (existing.expiresAt.getTime() <= Number(now.epochMilliseconds)) {
      await this.prisma.idempotencyRecord.deleteMany({ where: { id: existing.id } });
      return this.claim(key, accountId, requestHash, now, expiresAt);
    }
    if (existing.requestHash !== requestHash) {
      return { outcome: 'mismatch' };
    }
    if (existing.statusCode === pendingStatusCode) {
      return { outcome: 'in-progress' };
    }
    return {
      outcome: 'completed',
      response: { statusCode: existing.statusCode, responseBody: existing.responseBody },
    };
  }

  async complete(
    key: string,
    accountId: AccountId,
    response: StoredIdempotentResponse,
  ): Promise<void> {
    await this.prisma.idempotencyRecord.update({
      where: { key_accountId: { key, accountId } },
      data: {
        statusCode: response.statusCode,
        responseBody: toJsonValue(response.responseBody),
      },
    });
  }

  async release(key: string, accountId: AccountId): Promise<void> {
    await this.prisma.idempotencyRecord.deleteMany({ where: { key, accountId } });
  }
}

function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
}
