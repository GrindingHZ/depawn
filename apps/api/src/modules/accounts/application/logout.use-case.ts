import { Inject, Injectable } from '@nestjs/common';
import { SESSION_REPOSITORY } from '../../../domain/accounts/session-repository';
import type { SessionRepository } from '../../../domain/accounts/session-repository';
import { SESSION_TOKEN_ISSUER } from '../../../domain/accounts/session-token-issuer';
import type { SessionTokenIssuer } from '../../../domain/accounts/session-token-issuer';
import { UNIT_OF_WORK } from '../../../domain/ports/unit-of-work';
import type { UnitOfWork } from '../../../domain/ports/unit-of-work';

@Injectable()
export class LogoutUseCase {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    @Inject(SESSION_REPOSITORY) private readonly sessions: SessionRepository,
    @Inject(SESSION_TOKEN_ISSUER) private readonly tokenIssuer: SessionTokenIssuer,
  ) {}

  execute(sessionToken: string): Promise<void> {
    return this.unitOfWork.run((context) =>
      this.sessions.deleteByTokenHash(this.tokenIssuer.hash(sessionToken), context),
    );
  }
}
