import { Inject, Injectable } from '@nestjs/common';
import { Liquidation, canBeScheduled } from '../../../domain/lending/liquidation';
import { LiquidationAlreadyScheduled } from '../../../domain/lending/liquidation-already-scheduled';
import { LIQUIDATION_REPOSITORY } from '../../../domain/lending/liquidation-repository';
import type { LiquidationRepository } from '../../../domain/lending/liquidation-repository';
import { LoanNotDefaulted } from '../../../domain/lending/loan-not-defaulted';
import { LoanNotFound } from '../../../domain/lending/loan-not-found';
import { LOAN_REPOSITORY } from '../../../domain/lending/loan-repository';
import type { LoanRepository } from '../../../domain/lending/loan-repository';
import { PROTOCOL_PARAMETERS } from '../../../domain/marketplace/protocol-parameters';
import type { ProtocolParameters } from '../../../domain/marketplace/protocol-parameters';
import { AUDIT_PORT } from '../../../domain/ports/audit.port';
import type { AuditPort } from '../../../domain/ports/audit.port';
import { CLOCK_PORT } from '../../../domain/ports/clock.port';
import type { ClockPort } from '../../../domain/ports/clock.port';
import { UNIT_OF_WORK } from '../../../domain/ports/unit-of-work';
import type { UnitOfWork } from '../../../domain/ports/unit-of-work';
import type { DomainError } from '../../../domain/shared/domain-error';
import { ID_GENERATOR } from '../../../domain/shared/id-generator';
import type { IdGenerator } from '../../../domain/shared/id-generator';
import { liquidationIdOf } from '../../../domain/shared/identifiers';
import type { AccountId, LoanId } from '../../../domain/shared/identifiers';
import type { Money } from '../../../domain/shared/money';
import { failure, ok } from '../../../domain/shared/result';
import type { Result } from '../../../domain/shared/result';

export interface ScheduleLiquidationCommand {
  readonly loanId: LoanId;
  readonly requestedBy: AccountId;
  readonly reservePrice: Money;
}

/* Flow 8 step 1. Operations schedules the sale; the gate is rule L6, which
   the loan's own defaultedAt answers. */
@Injectable()
export class ScheduleLiquidationUseCase {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    @Inject(LOAN_REPOSITORY) private readonly loans: LoanRepository,
    @Inject(LIQUIDATION_REPOSITORY) private readonly liquidations: LiquidationRepository,
    @Inject(AUDIT_PORT) private readonly audit: AuditPort,
    @Inject(CLOCK_PORT) private readonly clock: ClockPort,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
    @Inject(PROTOCOL_PARAMETERS) private readonly parameters: ProtocolParameters,
  ) {}

  execute(command: ScheduleLiquidationCommand): Promise<Result<Liquidation, DomainError>> {
    return this.unitOfWork.run(async (context) => {
      await this.loans.lock(command.loanId, context);
      const loan = await this.loans.findById(command.loanId, context);
      if (loan === null) {
        return failure(new LoanNotFound());
      }
      if (loan.status !== 'DEFAULTED' || loan.defaultedAt === null) {
        return failure(new LoanNotDefaulted());
      }

      // One sale per loan. The database enforces it too, but a second
      // attempt deserves an answer rather than a fault.
      const existing = await this.liquidations.findByLoan(loan.id, context);
      if (existing !== null) {
        return failure(new LiquidationAlreadyScheduled());
      }

      const withinRules = canBeScheduled(loan.defaultedAt, this.clock.now(), this.parameters);
      if (!withinRules.ok) {
        return withinRules;
      }

      const liquidation = Liquidation.schedule({
        id: liquidationIdOf(this.idGenerator.generate()),
        loanId: loan.id,
        receiptId: loan.receiptId,
        reservePrice: command.reservePrice,
      });
      await this.liquidations.save(liquidation, context);
      await this.audit.record(
        {
          actorType: 'ACCOUNT',
          actorId: command.requestedBy,
          subjectType: 'liquidation',
          subjectId: liquidation.id,
          action: 'schedule_liquidation',
          before: { loanStatus: loan.status },
          after: {
            loanId: loan.id,
            reservePrice: command.reservePrice.minorUnits.toString(),
          },
        },
        context,
      );
      return ok(liquidation);
    });
  }
}
