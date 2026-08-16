import { Inject, Injectable } from '@nestjs/common';
import type { Liquidation } from '../../../domain/lending/liquidation';
import { LIQUIDATION_REPOSITORY } from '../../../domain/lending/liquidation-repository';
import type { LiquidationRepository } from '../../../domain/lending/liquidation-repository';
import { LiquidationNotFound } from '../../../domain/lending/liquidation-not-found';
import { distributeLiquidationProceeds } from '../../../domain/lending/liquidation-waterfall';
import { LoanNotFound } from '../../../domain/lending/loan-not-found';
import { LOAN_REPOSITORY } from '../../../domain/lending/loan-repository';
import type { LoanRepository } from '../../../domain/lending/loan-repository';
import { PROTOCOL_PARAMETERS } from '../../../domain/marketplace/protocol-parameters';
import type { ProtocolParameters } from '../../../domain/marketplace/protocol-parameters';
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
import type { AccountId, LiquidationId } from '../../../domain/shared/identifiers';
import type { Distribution } from '../../../domain/shared/settlement-ref';
import { failure, ok } from '../../../domain/shared/result';
import type { Result } from '../../../domain/shared/result';

export interface CloseLiquidationCommand {
  readonly liquidationId: LiquidationId;
  readonly requestedBy: AccountId;
}

export interface SettledLiquidation {
  readonly liquidation: Liquidation;
  readonly distributions: readonly Distribution[];
}

/* Flow 8 step 4. One transaction: the waterfall settles as a single release
   of the winning bidder's hold, the receipt burns, and the loan closes. The
   loan is locked first, matching every other write path that touches a
   receipt tied to a live loan. */
@Injectable()
export class CloseLiquidationUseCase {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    @Inject(LIQUIDATION_REPOSITORY) private readonly liquidations: LiquidationRepository,
    @Inject(LOAN_REPOSITORY) private readonly loans: LoanRepository,
    @Inject(SETTLEMENT_PORT) private readonly settlement: SettlementPort,
    @Inject(CUSTODY_PORT) private readonly custody: CustodyPort,
    @Inject(DOMAIN_EVENT_PUBLISHER) private readonly events: DomainEventPublisher,
    @Inject(AUDIT_PORT) private readonly audit: AuditPort,
    @Inject(CLOCK_PORT) private readonly clock: ClockPort,
    @Inject(PROTOCOL_PARAMETERS) private readonly parameters: ProtocolParameters,
  ) {}

  async execute(
    command: CloseLiquidationCommand,
  ): Promise<Result<SettledLiquidation, DomainError>> {
    try {
      return await this.unitOfWork.run(async (context) => {
        const found = await this.liquidations.findById(command.liquidationId, context);
        if (found === null) {
          return failure(new LiquidationNotFound());
        }
        await this.loans.lock(found.loanId, context);
        await this.liquidations.lock(found.id, context);
        const liquidation = await this.liquidations.findById(command.liquidationId, context);
        const loan = await this.loans.findById(found.loanId, context);
        if (liquidation === null) {
          return failure(new LiquidationNotFound());
        }
        if (loan === null) {
          return failure(new LoanNotFound());
        }

        const closed = liquidation.close();
        if (!closed.ok) {
          return closed;
        }
        const noteHolder = await this.loans.findLenderNoteHolder(loan.id, context);
        if (noteHolder === null) {
          return failure(new LoanNotFound());
        }

        // Interest stopped at maturity, so the amount owed is the figure due
        // at any instant past it.
        const now = this.clock.now();
        const distributions = distributeLiquidationProceeds(
          closed.value.winningBid.amount,
          loan.calculateAmountDue(now),
          { noteHolder, borrower: loan.borrowerAccountId },
          this.parameters,
        );

        const settlementRef = await this.settlement.releaseHold(
          {
            id: closed.value.winningBid.fundsHoldId,
            accountId: closed.value.winningBid.bidderAccountId,
            amount: closed.value.winningBid.amount,
            settlementRef: {
              kind: 'ledger',
              reference: closed.value.winningBid.fundsHoldId,
              settledAt: now,
            },
          },
          [...distributions],
          'SETTLE_LIQUIDATION',
          context,
        );

        // The receipt may sit with the borrower or with a lender who already
        // claimed it, and burnForLiquidation allows both live states (Q-012).
        await this.custody.burnReceipt(loan.receiptId, 'LIQUIDATION', context);
        const liquidated = loan.markLiquidated();
        if (!liquidated.ok) {
          return liquidated;
        }
        await this.loans.save(liquidated.value, context);
        await this.liquidations.save(closed.value.liquidation, context);

        await this.events.publish(
          [
            {
              type: 'LiquidationSettled',
              liquidationId: liquidation.id,
              proceeds: closed.value.winningBid.amount,
              distributions: [...distributions],
            },
          ],
          context,
        );
        await this.audit.record(
          {
            actorType: 'ACCOUNT',
            actorId: command.requestedBy,
            subjectType: 'liquidation',
            subjectId: liquidation.id,
            action: 'close_liquidation',
            after: {
              winningBidId: closed.value.winningBid.id,
              settlementRef: settlementRef.reference,
            },
          },
          context,
        );
        return ok({ liquidation: closed.value.liquidation, distributions });
      });
    } catch (error) {
      if (error instanceof DomainError) {
        return failure(error);
      }
      throw error;
    }
  }
}
