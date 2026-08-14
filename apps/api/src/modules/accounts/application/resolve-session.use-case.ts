import { Inject, Injectable } from '@nestjs/common';
import type { Account } from '../../../domain/accounts/account';
import { ACCOUNT_REPOSITORY } from '../../../domain/accounts/account-repository';
import type { AccountRepository } from '../../../domain/accounts/account-repository';
import { SESSION_REPOSITORY } from '../../../domain/accounts/session-repository';
import type { SessionRepository } from '../../../domain/accounts/session-repository';
import { SESSION_TOKEN_ISSUER } from '../../../domain/accounts/session-token-issuer';
import type { SessionTokenIssuer } from '../../../domain/accounts/session-token-issuer';
import { CLOCK_PORT } from '../../../domain/ports/clock.port';
import type { ClockPort } from '../../../domain/ports/clock.port';
import { UNIT_OF_WORK } from '../../../domain/ports/unit-of-work';
import type { UnitOfWork } from '../../../domain/ports/unit-of-work';

@Injectable()
export class ResolveSessionUseCase {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    @Inject(SESSION_REPOSITORY) private readonly sessions: SessionRepository,
    @Inject(ACCOUNT_REPOSITORY) private readonly accounts: AccountRepository,
    @Inject(SESSION_TOKEN_ISSUER) private readonly tokenIssuer: SessionTokenIssuer,
    @Inject(CLOCK_PORT) private readonly clock: ClockPort,
  ) {}

  execute(sessionToken: string): Promise<Account | null> {
    return this.unitOfWork.run(async (context) => {
      const session = await this.sessions.findByTokenHash(
        this.tokenIssuer.hash(sessionToken),
        context,
      );
      if (session === null || session.isExpired(this.clock.now())) {
        return null;
      }
      return this.accounts.findById(session.accountId, context);
    });
  }
}
