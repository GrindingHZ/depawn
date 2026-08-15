import { Inject, Injectable } from '@nestjs/common';
import type { RedemptionRequest } from '../../../domain/custody/redemption-request';
import { RedemptionRequestNotFound } from '../../../domain/custody/redemption-request-not-found';
import { REDEMPTION_REQUEST_REPOSITORY } from '../../../domain/custody/redemption-request-repository';
import type { RedemptionRequestRepository } from '../../../domain/custody/redemption-request-repository';
import { AUDIT_PORT } from '../../../domain/ports/audit.port';
import type { AuditPort } from '../../../domain/ports/audit.port';
import { CLOCK_PORT } from '../../../domain/ports/clock.port';
import type { ClockPort } from '../../../domain/ports/clock.port';
import { DOMAIN_EVENT_PUBLISHER } from '../../../domain/ports/domain-event-publisher.port';
import type { DomainEventPublisher } from '../../../domain/ports/domain-event-publisher.port';
import { UNIT_OF_WORK } from '../../../domain/ports/unit-of-work';
import type { UnitOfWork } from '../../../domain/ports/unit-of-work';
import type { DomainError } from '../../../domain/shared/domain-error';
import { staffIdOf } from '../../../domain/shared/identifiers';
import type { AccountId, RedemptionRequestId } from '../../../domain/shared/identifiers';
import { failure, ok } from '../../../domain/shared/result';
import type { Result } from '../../../domain/shared/result';

export interface ConfirmReleaseCommand {
  readonly requestId: RedemptionRequestId;
  readonly releasedBy: AccountId;
  readonly sealNumberBroken: string;
}

/* Flow 6 step 4, its own transaction. The row lock is what stops a repeated
   confirmation handing the same item over twice. Vault exposure needs no
   decrement here: it is derived from live receipts and the burn at request
   time already removed this one. */
@Injectable()
export class ConfirmReleaseUseCase {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    @Inject(REDEMPTION_REQUEST_REPOSITORY)
    private readonly requests: RedemptionRequestRepository,
    @Inject(DOMAIN_EVENT_PUBLISHER) private readonly events: DomainEventPublisher,
    @Inject(AUDIT_PORT) private readonly audit: AuditPort,
    @Inject(CLOCK_PORT) private readonly clock: ClockPort,
  ) {}

  execute(command: ConfirmReleaseCommand): Promise<Result<RedemptionRequest, DomainError>> {
    return this.unitOfWork.run(async (context) => {
      await this.requests.lock(command.requestId, context);
      const request = await this.requests.findById(command.requestId, context);
      if (request === null) {
        return failure(new RedemptionRequestNotFound());
      }

      const staffId = staffIdOf(command.releasedBy);
      const released = request.release(staffId, command.sealNumberBroken, this.clock.now());
      if (!released.ok) {
        return released;
      }
      await this.requests.save(released.value, context);

      await this.events.publish(
        [{ type: 'ItemReleased', receiptId: request.receiptId, releasedBy: staffId }],
        context,
      );
      await this.audit.record(
        {
          actorType: 'ACCOUNT',
          actorId: command.releasedBy,
          subjectType: 'redemption_request',
          subjectId: request.id,
          action: 'confirm_release',
          before: { status: request.status },
          after: { status: released.value.status, sealNumberBroken: command.sealNumberBroken },
        },
        context,
      );
      return ok(released.value);
    });
  }
}
