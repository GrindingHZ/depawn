import { Inject, Injectable } from '@nestjs/common';
import type { Loan } from '../../../domain/lending/loan';
import { LoanNotFound } from '../../../domain/lending/loan-not-found';
import { LOAN_REPOSITORY } from '../../../domain/lending/loan-repository';
import type { LoanRepository } from '../../../domain/lending/loan-repository';
import { NotResourceOwner } from '../../../domain/marketplace/not-resource-owner';
import { AUDIT_PORT } from '../../../domain/ports/audit.port';
import type { AuditPort } from '../../../domain/ports/audit.port';
import { CLOCK_PORT } from '../../../domain/ports/clock.port';
import type { ClockPort } from '../../../domain/ports/clock.port';
import { DOMAIN_EVENT_PUBLISHER } from '../../../domain/ports/domain-event-publisher.port';
import type { DomainEventPublisher } from '../../../domain/ports/domain-event-publisher.port';
import { UNIT_OF_WORK } from '../../../domain/ports/unit-of-work';
import type { UnitOfWork } from '../../../domain/ports/unit-of-work';
import type { DomainError } from '../../../domain/shared/domain-error';
import type { AccountId, LoanId } from '../../../domain/shared/identifiers';
import { failure, ok } from '../../../domain/shared/result';
import type { Result } from '../../../domain/shared/result';

export interface MarkDefaultCommand {
  readonly loanId: LoanId;
  readonly requestedBy: AccountId;
}

/* Flow 7 step 1. No money moves, so there is no settlement here: the whole
   transaction is a status, an instant, and an event. Rule S2 keeps this
   available while the system is paused, which the P7 pause slice must
   respect when it adds the switch. */
@Injectable()
export class MarkDefaultUseCase {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    @Inject(LOAN_REPOSITORY) private readonly loans: LoanRepository,
    @Inject(DOMAIN_EVENT_PUBLISHER) private readonly events: DomainEventPublisher,
    @Inject(AUDIT_PORT) private readonly audit: AuditPort,
    @Inject(CLOCK_PORT) private readonly clock: ClockPort,
  ) {}

  execute(command: MarkDefaultCommand): Promise<Result<Loan, DomainError>> {
    return this.unitOfWork.run(async (context) => {
      await this.loans.lock(command.loanId, context);
      const loan = await this.loans.findById(command.loanId, context);
      if (loan === null) {
        return failure(new LoanNotFound());
      }
      const noteHolder = await this.loans.findLenderNoteHolder(loan.id, context);
      if (noteHolder !== command.requestedBy) {
        return failure(new NotResourceOwner());
      }

      const now = this.clock.now();
      const defaulted = loan.markDefaulted(now);
      if (!defaulted.ok) {
        return defaulted;
      }
      await this.loans.save(defaulted.value, context);

      await this.events.publish(
        [{ type: 'LoanDefaulted', loanId: loan.id, defaultedAt: now }],
        context,
      );
      await this.audit.record(
        {
          actorType: 'ACCOUNT',
          actorId: command.requestedBy,
          subjectType: 'loan',
          subjectId: loan.id,
          action: 'mark_default',
          before: { status: loan.status },
          after: { status: defaulted.value.status },
        },
        context,
      );
      return ok(defaulted.value);
    });
  }
}
