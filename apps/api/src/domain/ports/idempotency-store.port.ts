import type { AccountId } from '../shared/identifiers';
import type { Instant } from '../shared/instant';

export interface StoredIdempotentResponse {
  readonly requestHash: string;
  readonly statusCode: number;
  readonly responseBody: unknown;
}

/* Backs business rule S3: every write endpoint accepts an idempotency key
   and is safe to retry. Phase 1 stores replays in Postgres; Phase 3 needs the
   same behaviour because a chain submission can succeed while the response is
   lost. */
export interface IdempotencyStore {
  find(key: string, accountId: AccountId, now: Instant): Promise<StoredIdempotentResponse | null>;
  save(
    key: string,
    accountId: AccountId,
    record: StoredIdempotentResponse,
    expiresAt: Instant,
  ): Promise<void>;
}

export const IDEMPOTENCY_STORE = Symbol('IdempotencyStore');
