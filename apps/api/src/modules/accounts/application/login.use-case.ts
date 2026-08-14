import { Inject, Injectable } from '@nestjs/common';
import type { Account } from '../../../domain/accounts/account';
import { ACCOUNT_REPOSITORY } from '../../../domain/accounts/account-repository';
import type { AccountRepository } from '../../../domain/accounts/account-repository';
import { InvalidCredentials } from '../../../domain/accounts/invalid-credentials';
import { PASSWORD_HASHER } from '../../../domain/accounts/password-hasher';
import type { PasswordHasher } from '../../../domain/accounts/password-hasher';
import { Session } from '../../../domain/accounts/session';
import { SESSION_REPOSITORY } from '../../../domain/accounts/session-repository';
import type { SessionRepository } from '../../../domain/accounts/session-repository';
import { SESSION_TOKEN_ISSUER } from '../../../domain/accounts/session-token-issuer';
import type { SessionTokenIssuer } from '../../../domain/accounts/session-token-issuer';
import { CLOCK_PORT } from '../../../domain/ports/clock.port';
import type { ClockPort } from '../../../domain/ports/clock.port';
import { UNIT_OF_WORK } from '../../../domain/ports/unit-of-work';
import type { UnitOfWork } from '../../../domain/ports/unit-of-work';
import { ID_GENERATOR } from '../../../domain/shared/id-generator';
import type { IdGenerator } from '../../../domain/shared/id-generator';
import { sessionIdOf } from '../../../domain/shared/identifiers';
import type { Instant } from '../../../domain/shared/instant';
import { failure, ok } from '../../../domain/shared/result';
import type { Result } from '../../../domain/shared/result';
import { SESSION_LIFETIME_MS } from './session-lifetime';

export interface LoginCommand {
  readonly email: string;
  readonly password: string;
}

export interface LoginOutcome {
  readonly account: Account;
  readonly sessionToken: string;
  readonly expiresAt: Instant;
}

@Injectable()
export class LoginUseCase {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    @Inject(ACCOUNT_REPOSITORY) private readonly accounts: AccountRepository,
    @Inject(SESSION_REPOSITORY) private readonly sessions: SessionRepository,
    @Inject(PASSWORD_HASHER) private readonly passwordHasher: PasswordHasher,
    @Inject(SESSION_TOKEN_ISSUER) private readonly tokenIssuer: SessionTokenIssuer,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
    @Inject(CLOCK_PORT) private readonly clock: ClockPort,
    @Inject(SESSION_LIFETIME_MS) private readonly sessionLifetimeMs: bigint,
  ) {}

  execute(command: LoginCommand): Promise<Result<LoginOutcome, InvalidCredentials>> {
    return this.unitOfWork.run(async (context) => {
      const account = await this.accounts.findByEmail(command.email, context);
      if (account === null) {
        return failure(new InvalidCredentials());
      }

      const passwordMatches = await this.passwordHasher.verify(
        account.passwordHash,
        command.password,
      );
      if (!passwordMatches) {
        return failure(new InvalidCredentials());
      }

      const { token, tokenHash } = this.tokenIssuer.issue();
      const expiresAt = this.clock.now().plusMilliseconds(this.sessionLifetimeMs);
      const session = Session.create({
        id: sessionIdOf(this.idGenerator.generate()),
        accountId: account.id,
        tokenHash,
        expiresAt,
      });
      await this.sessions.save(session, context);

      return ok({ account, sessionToken: token, expiresAt });
    });
  }
}
