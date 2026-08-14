import type { AccountId, SessionId } from '../shared/identifiers';
import type { Instant } from '../shared/instant';

/* Only the hash of the session token is ever stored; the raw token lives in
   the borrower's cookie and nowhere else. */
export class Session {
  private constructor(
    readonly id: SessionId,
    readonly accountId: AccountId,
    readonly tokenHash: string,
    readonly expiresAt: Instant,
  ) {}

  static create(input: {
    id: SessionId;
    accountId: AccountId;
    tokenHash: string;
    expiresAt: Instant;
  }): Session {
    return new Session(input.id, input.accountId, input.tokenHash, input.expiresAt);
  }

  static restore(input: {
    id: SessionId;
    accountId: AccountId;
    tokenHash: string;
    expiresAt: Instant;
  }): Session {
    return new Session(input.id, input.accountId, input.tokenHash, input.expiresAt);
  }

  isExpired(now: Instant): boolean {
    return now.isAfter(this.expiresAt);
  }
}
