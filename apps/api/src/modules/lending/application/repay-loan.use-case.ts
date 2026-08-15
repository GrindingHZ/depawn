import { Inject, Injectable } from '@nestjs/common';
import { LoanNotActive } from '../../../domain/lending/loan-not-active';
import { LOAN_REPOSITORY } from '../../../domain/lending/loan-repository';
import type { LoanRepository } from '../../../domain/lending/loan-repository';
import type { RepaymentBreakdown } from '../../../domain/lending/loan';
import { PayoffQuoteStale } from '../../../domain/lending/payoff-quote-stale';
import { NotResourceOwner } from '../../../domain/marketplace/not-resource-owner';
import { AUDIT_PORT } from '../../../domain/ports/audit.port';
import type { AuditPort } from '../../../domain/ports/audit.port';
import { CLOCK_PORT } from '../../../domain/ports/clock.port';
import type { ClockPort } from '../../../domain/ports/clock.port';
import { CUSTODY_PORT } from '../../../domain/ports/custody.port';
import type { CustodyPort } from '../../../domain/ports/custody.port';
import { DOMAIN_EVENT_PUBLISHER } from '../../../domain/ports/domain-event-publisher.port';
import type { DomainEventPublisher } from '../../../domain/ports/domain-event-publisher.port';
import { SETTLEMENT_PORT } from '../../../domain/ports/settlement.port';
import type { SettlementPort } from '../../../domain/ports/settlement.port';
import { UNIT_OF_WORK } from '../../../domain/ports/unit-of-work';
import type { UnitOfWork } from '../../../domain/ports/unit-of-work';
import { DomainError } from '../../../domain/shared/domain-error';
import type { AccountId, LoanId } from '../../../domain/shared/identifiers';
import type { Instant } from '../../../domain/shared/instant';
import type { Money } from '../../../domain/shared/money';
import { failure, ok } from '../../../domain/shared/result';
import type { Result } from '../../../domain/shared/result';
import { LoanNotFound } from '../../../domain/lending/loan-not-found';

export interface RepayLoanCommand {
  readonly loanId: LoanId;
  readonly requestedBy: AccountId;
  readonly payment: Money;
  readonly quotedAt: Instant;
}

export interface RepaymentOutcome {
  readonly breakdown: RepaymentBreakdown;
  readonly paidTo: AccountId;
}

/* Flow 5 step 2. The whole settlement is one transaction so the payment, the
   status, and the freed collateral cannot come apart. */
@Injectable()
export class RepayLoanUseCase {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    @Inject(LOAN_REPOSITORY) private readonly loans: LoanRepository,
    @Inject(SETTLEMENT_PORT) private readonly settlement: SettlementPort,
    @Inject(CUSTODY_PORT) private readonly custody: CustodyPort,
    @Inject(DOMAIN_EVENT_PUBLISHER) private readonly events: DomainEventPublisher,
    @Inject(AUDIT_PORT) private readonly audit: AuditPort,
    @Inject(CLOCK_PORT) private readonly clock: ClockPort,
  ) {}

  async execute(command: RepayLoanCommand): Promise<Result<RepaymentOutcome, DomainError>> {
    try {
      return await this.unitOfWork.run(async (context) => {
        await this.loans.lock(command.loanId, context);
        const loan = await this.loans.findById(command.loanId, context);
        if (loan === null) {
          return failure(new LoanNotFound());
        }
        if (loan.borrowerAccountId !== command.requestedBy) {
          return failure(new NotResourceOwner());
        }
        if (!loan.canBeRepaid()) {
          return failure(new LoanNotActive());
        }

        // The quote is only honoured while the figure it named is still the
        // figure owed; a moved clock returns the new one rather than
        // charging a number the borrower never saw.
        const now = this.clock.now();
        const amountDue = loan.calculateAmountDue(now);
        if (!loan.calculateAmountDue(command.quotedAt).equals(amountDue)) {
          return failure(new PayoffQuoteStale(amountDue));
        }

        const recorded = loan.recordRepayment(command.payment, now);
        if (!recorded.ok) {
          return recorded;
        }
        const noteHolder = await this.loans.findLenderNoteHolder(loan.id, context);
        if (noteHolder === null) {
          return failure(new LoanNotFound());
        }

        const settlementRef = await this.settlement.transfer(
          {
            fromAccountId: loan.borrowerAccountId,
            toAccountId: noteHolder,
            amount: recorded.value.total,
            reference: loan.id,
          },
          context,
        );
        await this.loans.save(recorded.value.loan, context);
        await this.custody.releaseEncumbrance(loan.receiptId, context);

        await this.events.publish(
          [
            {
              type: 'LoanRepaid',
              loanId: loan.id,
              amountPaid: recorded.value.total,
              settlementRef,
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
            action: 'repay_loan',
            after: {
              paidTo: noteHolder,
              total: recorded.value.total.minorUnits.toString(),
              settlementRef: settlementRef.reference,
            },
          },
          context,
        );
        return ok({ breakdown: recorded.value, paidTo: noteHolder });
      });
    } catch (error) {
      if (error instanceof DomainError) {
        return failure(error);
      }
      throw error;
    }
  }
}
