import { Inject, Injectable } from '@nestjs/common';
import { Appraisal } from '../../../domain/custody/appraisal';
import { APPRAISAL_REPOSITORY } from '../../../domain/custody/appraisal-repository';
import type { AppraisalRepository } from '../../../domain/custody/appraisal-repository';
import { IntakeAlreadySealed } from '../../../domain/custody/intake-already-sealed';
import { IntakeNotFound } from '../../../domain/custody/intake-not-found';
import { INTAKE_RECORD_REPOSITORY } from '../../../domain/custody/intake-record-repository';
import type { IntakeRecordRepository } from '../../../domain/custody/intake-record-repository';
import { AUDIT_PORT } from '../../../domain/ports/audit.port';
import type { AuditPort } from '../../../domain/ports/audit.port';
import { CLOCK_PORT } from '../../../domain/ports/clock.port';
import type { ClockPort } from '../../../domain/ports/clock.port';
import { UNIT_OF_WORK } from '../../../domain/ports/unit-of-work';
import type { UnitOfWork } from '../../../domain/ports/unit-of-work';
import { ID_GENERATOR } from '../../../domain/shared/id-generator';
import type { IdGenerator } from '../../../domain/shared/id-generator';
import { appraisalIdOf, staffIdOf } from '../../../domain/shared/identifiers';
import type { AccountId, IntakeId } from '../../../domain/shared/identifiers';
import type { Money } from '../../../domain/shared/money';
import { failure, ok } from '../../../domain/shared/result';
import type { Result } from '../../../domain/shared/result';

export interface RecordAppraisalCommand {
  readonly intakeId: IntakeId;
  readonly requestedBy: AccountId;
  readonly value: Money;
  readonly method: string;
  readonly comparableReferences: string;
}

@Injectable()
export class RecordAppraisalUseCase {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    @Inject(INTAKE_RECORD_REPOSITORY) private readonly intakes: IntakeRecordRepository,
    @Inject(APPRAISAL_REPOSITORY) private readonly appraisals: AppraisalRepository,
    @Inject(AUDIT_PORT) private readonly audit: AuditPort,
    @Inject(CLOCK_PORT) private readonly clock: ClockPort,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
  ) {}

  execute(
    command: RecordAppraisalCommand,
  ): Promise<Result<Appraisal, IntakeNotFound | IntakeAlreadySealed>> {
    return this.unitOfWork.run(async (context) => {
      const intake = await this.intakes.findById(command.intakeId, context);
      if (intake === null) {
        return failure(new IntakeNotFound());
      }
      if (intake.isSealed) {
        return failure(new IntakeAlreadySealed());
      }

      const appraisal = Appraisal.create({
        id: appraisalIdOf(this.idGenerator.generate()),
        intakeId: command.intakeId,
        appraiserId: staffIdOf(command.requestedBy),
        value: command.value,
        method: command.method,
        comparableReferences: command.comparableReferences,
        appraisedAt: this.clock.now(),
      });
      await this.appraisals.save(appraisal, context);
      await this.audit.record(
        {
          actorType: 'ACCOUNT',
          actorId: command.requestedBy,
          subjectType: 'intake_record',
          subjectId: intake.id,
          action: 'record_appraisal',
          after: { appraisalId: appraisal.id, value: appraisal.value.minorUnits.toString() },
        },
        context,
      );
      return ok(appraisal);
    });
  }
}
