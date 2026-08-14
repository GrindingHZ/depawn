import type { AccountId } from '../shared/identifiers';
import type { Instant } from '../shared/instant';

export interface StoredIdempotentResponse {
  readonly statusCode: number;
  readonly responseBody: unknown;
}

export type IdempotencyClaim =
  /* This request owns the key and must execute, then complete or release. */
  | { readonly outcome: 'claimed' }
  /* Another request with the same key is executing or crashed mid flight;
     never execute again, the money may already have moved. */
  | { readonly outcome: 'in-progress' }
  /* The same key was used with a different payload. */
  | { readonly outcome: 'mismatch' }
  | { readonly outcome: 'completed'; readonly response: StoredIdempotentResponse };

/* Backs business rule S3: every write endpoint accepts an idempotency key and
   is safe to retry. The key is reserved before the handler runs so a retry
   racing its original can never execute twice; Phase 3 needs the same shape
   because a chain submission can succeed while the response is lost. */
export interface IdempotencyStore {
  claim(
    key: string,
    accountId: AccountId,
    requestHash: string,
    now: Instant,
    expiresAt: Instant,
  ): Promise<IdempotencyClaim>;
  complete(key: string, accountId: AccountId, response: StoredIdempotentResponse): Promise<void>;
  release(key: string, accountId: AccountId): Promise<void>;
}

export const IDEMPOTENCY_STORE = Symbol('IdempotencyStore');
