import type { Account } from '../../../../domain/accounts/account';
import type { AccountRepository } from '../../../../domain/accounts/account-repository';
import type { PasswordHasher } from '../../../../domain/accounts/password-hasher';
import type { Session } from '../../../../domain/accounts/session';
import type { SessionRepository } from '../../../../domain/accounts/session-repository';
import type {
  SessionTokenIssuer,
  SessionTokenPair,
} from '../../../../domain/accounts/session-token-issuer';
import type { ClockPort } from '../../../../domain/ports/clock.port';
import type { UnitOfWork, UnitOfWorkContext } from '../../../../domain/ports/unit-of-work';
import type { IdGenerator } from '../../../../domain/shared/id-generator';
import type { AccountId } from '../../../../domain/shared/identifiers';
import type { Instant } from '../../../../domain/shared/instant';

export const fakeContext: UnitOfWorkContext = { driver: 'fake' };

export const passThroughUnitOfWork: UnitOfWork = {
  run: (work) => work(fakeContext),
};

export class InMemoryAccountRepository implements AccountRepository {
  private readonly accounts = new Map<string, Account>();

  findById(id: AccountId): Promise<Account | null> {
    return Promise.resolve(this.accounts.get(id) ?? null);
  }

  findByEmail(email: string): Promise<Account | null> {
    const match = [...this.accounts.values()].find(
      (account) => account.email === email.toLowerCase(),
    );
    return Promise.resolve(match ?? null);
  }

  save(account: Account): Promise<void> {
    this.accounts.set(account.id, account);
    return Promise.resolve();
  }
}

export class InMemorySessionRepository implements SessionRepository {
  private readonly sessions = new Map<string, Session>();

  findByTokenHash(tokenHash: string): Promise<Session | null> {
    return Promise.resolve(this.sessions.get(tokenHash) ?? null);
  }

  save(session: Session): Promise<void> {
    this.sessions.set(session.tokenHash, session);
    return Promise.resolve();
  }

  deleteByTokenHash(tokenHash: string): Promise<void> {
    this.sessions.delete(tokenHash);
    return Promise.resolve();
  }
}

export class ReversingPasswordHasher implements PasswordHasher {
  hash(plainPassword: string): Promise<string> {
    return Promise.resolve([...plainPassword].reverse().join(''));
  }

  async verify(passwordHash: string, plainPassword: string): Promise<boolean> {
    return (await this.hash(plainPassword)) === passwordHash;
  }
}

export class CountingIdGenerator implements IdGenerator {
  private next = 0;

  generate(): string {
    this.next += 1;
    return `ID-${this.next}`;
  }
}

export class StoppedClock implements ClockPort {
  constructor(private readonly instant: Instant) {}

  now(): Instant {
    return this.instant;
  }
}

export class PredictableTokenIssuer implements SessionTokenIssuer {
  issue(): SessionTokenPair {
    return { token: 'raw-token', tokenHash: this.hash('raw-token') };
  }

  hash(token: string): string {
    return `hashed:${token}`;
  }
}
