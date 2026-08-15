import { Inject, Injectable } from '@nestjs/common';
import type { RedemptionRequest } from '../../../domain/custody/redemption-request';
import { RedemptionRequestNotFound } from '../../../domain/custody/redemption-request-not-found';
import { REDEMPTION_REQUEST_REPOSITORY } from '../../../domain/custody/redemption-request-repository';
import type { RedemptionRequestRepository } from '../../../domain/custody/redemption-request-repository';
import { AUDIT_PORT } from '../../../domain/ports/audit.port';
import type { AuditPort } from '../../../domain/ports/audit.port';
import { CLOCK_PORT } from '../../../domain/ports/clock.port';
import type { ClockPort } from '../../../domain/ports/clock.port';
import { UNIT_OF_WORK } from '../../../domain/ports/unit-of-work';
import type { UnitOfWork } from '../../../domain/ports/unit-of-work';
import type { DomainError } from '../../../domain/shared/domain-error';
import { staffIdOf } from '../../../domain/shared/identifiers';
import type { AccountId, RedemptionRequestId } from '../../../domain/shared/identifiers';
import { failure, ok } from '../../../domain/shared/result';
import type { Result } from '../../../domain/shared/result';

export interface VerifyRedemptionCommand {
  readonly requestId: RedemptionRequestId;
  readonly verifiedBy: AccountId;
}

/* Flow 6 step 3, its own transaction. In Phase 1 verification is an operator
   assertion recorded against a named member of staff; the signed challenge
   through IdentityPort.verifyControl belongs to Phase 3. */
@Injectable()
export class VerifyRedemptionUseCase {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    @Inject(REDEMPTION_REQUEST_REPOSITORY)
    private readonly requests: RedemptionRequestRepository,
    @Inject(AUDIT_PORT) private readonly audit: AuditPort,
    @Inject(CLOCK_PORT) private readonly clock: ClockPort,
  ) {}

  execute(command: VerifyRedemptionCommand): Promise<Result<RedemptionRequest, DomainError>> {
    return this.unitOfWork.run(async (context) => {
      await this.requests.lock(command.requestId, context);
      const request = await this.requests.findById(command.requestId, context);
      if (request === null) {
        return failure(new RedemptionRequestNotFound());
      }

      const verified = request.verify(staffIdOf(command.verifiedBy), this.clock.now());
      if (!verified.ok) {
        return verified;
      }
      await this.requests.save(verified.value, context);
      await this.audit.record(
        {
          actorType: 'ACCOUNT',
          actorId: command.verifiedBy,
          subjectType: 'redemption_request',
          subjectId: request.id,
          action: 'verify_redemption',
          before: { status: request.status },
          after: { status: verified.value.status },
        },
        context,
      );
      return ok(verified.value);
    });
  }
}
