import { Inject, Injectable } from '@nestjs/common';
import type { Loan } from '../../../domain/lending/loan';
import { LoanNotFound } from '../../../domain/lending/loan-not-found';
import { LOAN_REPOSITORY } from '../../../domain/lending/loan-repository';
import type { LoanRepository } from '../../../domain/lending/loan-repository';
import { LoanNotActive } from '../../../domain/lending/loan-not-active';
import { LoanNotDefaulted } from '../../../domain/lending/loan-not-defaulted';
import { NotResourceOwner } from '../../../domain/marketplace/not-resource-owner';
import { AUDIT_PORT } from '../../../domain/ports/audit.port';
import type { AuditPort } from '../../../domain/ports/audit.port';
import { CUSTODY_PORT } from '../../../domain/ports/custody.port';
import type { CustodyPort } from '../../../domain/ports/custody.port';
import { DOMAIN_EVENT_PUBLISHER } from '../../../domain/ports/domain-event-publisher.port';
import type { DomainEventPublisher } from '../../../domain/ports/domain-event-publisher.port';
import { UNIT_OF_WORK } from '../../../domain/ports/unit-of-work';
import type { UnitOfWork } from '../../../domain/ports/unit-of-work';
import { DomainError } from '../../../domain/shared/domain-error';
import type { AccountId, LoanId } from '../../../domain/shared/identifiers';
import { failure, ok } from '../../../domain/shared/result';
import type { Result } from '../../../domain/shared/result';

export interface ClaimReceiptCommand {
  readonly loanId: LoanId;
  readonly requestedBy: AccountId;
}

/* Flow 7 step 2. Custody moves, money does not: the claimant ends up
   holding the receipt in the vault, from where they can redeem the item
   through flow 6 exactly as a borrower would. */
@Injectable()
export class ClaimReceiptUseCase {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    @Inject(LOAN_REPOSITORY) private readonly loans: LoanRepository,
    @Inject(CUSTODY_PORT) private readonly custody: CustodyPort,
    @Inject(DOMAIN_EVENT_PUBLISHER) private readonly events: DomainEventPublisher,
    @Inject(AUDIT_PORT) private readonly audit: AuditPort,
  ) {}

  async execute(command: ClaimReceiptCommand): Promise<Result<Loan, DomainError>> {
    try {
      return await this.unitOfWork.run(async (context) => {
        await this.loans.lock(command.loanId, context);
        const loan = await this.loans.findById(command.loanId, context);
        if (loan === null) {
          return failure(new LoanNotFound());
        }
        const noteHolder = await this.loans.findLenderNoteHolder(loan.id, context);
        if (noteHolder !== command.requestedBy) {
          return failure(new NotResourceOwner());
        }
        if (!loan.allows('claimReceipt')) {
          // A loan that closed before the claim is a different answer from
          // one that never defaulted: flow 7 names LOAN_NOT_ACTIVE for the
          // borrower who repaid in time.
          return failure(loan.status === 'ACTIVE' ? new LoanNotDefaulted() : new LoanNotActive());
        }

        await this.custody.claimReceipt(loan.receiptId, command.requestedBy, context);
        await this.events.publish(
          [
            {
              type: 'ReceiptClaimedByLender',
              loanId: loan.id,
              receiptId: loan.receiptId,
              claimantAccountId: command.requestedBy,
            },
          ],
          context,
        );
        await this.audit.record(
          {
            actorType: 'ACCOUNT',
            actorId: command.requestedBy,
            subjectType: 'loan',
            subjectId: loan.id,
            action: 'claim_receipt',
            before: { status: loan.status },
            after: { receiptId: loan.receiptId, claimantAccountId: command.requestedBy },
          },
          context,
        );
        return ok(loan);
      });
    } catch (error) {
      if (error instanceof DomainError) {
        return failure(error);
      }
      throw error;
    }
  }
}
