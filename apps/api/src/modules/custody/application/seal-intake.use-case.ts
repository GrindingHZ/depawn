import { Inject, Injectable } from '@nestjs/common';
import { APPRAISAL_REPOSITORY } from '../../../domain/custody/appraisal-repository';
import type { AppraisalRepository } from '../../../domain/custody/appraisal-repository';
import type { DualAppraisalRequired } from '../../../domain/custody/dual-appraisal-required';
import type { IntakeAlreadySealed } from '../../../domain/custody/intake-already-sealed';
import type { IntakeIncomplete } from '../../../domain/custody/intake-incomplete';
import { IntakeNotFound } from '../../../domain/custody/intake-not-found';
import type { IntakeRecord } from '../../../domain/custody/intake-record';
import { INTAKE_RECORD_REPOSITORY } from '../../../domain/custody/intake-record-repository';
import type { IntakeRecordRepository } from '../../../domain/custody/intake-record-repository';
import { AUDIT_PORT } from '../../../domain/ports/audit.port';
import type { AuditPort } from '../../../domain/ports/audit.port';
import { UNIT_OF_WORK } from '../../../domain/ports/unit-of-work';
import type { UnitOfWork } from '../../../domain/ports/unit-of-work';
import type { AccountId, IntakeId } from '../../../domain/shared/identifiers';
import type { Money } from '../../../domain/shared/money';
import { failure, ok } from '../../../domain/shared/result';
import type { Result } from '../../../domain/shared/result';
import { DUAL_APPRAISAL_THRESHOLD } from './intake-tokens';

export interface SealIntakeCommand {
  readonly intakeId: IntakeId;
  readonly requestedBy: AccountId;
}

type SealRejection =
  IntakeNotFound | IntakeAlreadySealed | IntakeIncomplete | DualAppraisalRequired;

@Injectable()
export class SealIntakeUseCase {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    @Inject(INTAKE_RECORD_REPOSITORY) private readonly intakes: IntakeRecordRepository,
    @Inject(APPRAISAL_REPOSITORY) private readonly appraisals: AppraisalRepository,
    @Inject(AUDIT_PORT) private readonly audit: AuditPort,
    @Inject(DUAL_APPRAISAL_THRESHOLD) private readonly dualAppraisalThreshold: Money,
  ) {}

  execute(command: SealIntakeCommand): Promise<Result<IntakeRecord, SealRejection>> {
    return this.unitOfWork.run(async (context) => {
      const intake = await this.intakes.findById(command.intakeId, context);
      if (intake === null) {
        return failure(new IntakeNotFound());
      }
      const appraisals = await this.appraisals.listByIntake(command.intakeId, context);
      const sealed = intake.seal(appraisals, this.dualAppraisalThreshold);
      if (!sealed.ok) {
        return sealed;
      }

      await this.intakes.save(sealed.value, context);
      await this.audit.record(
        {
          actorType: 'ACCOUNT',
          actorId: command.requestedBy,
          subjectType: 'intake_record',
          subjectId: intake.id,
          action: 'seal_intake',
          before: { status: intake.status },
          after: { sealedHash: sealed.value.sealedHash },
        },
        context,
      );
      return ok(sealed.value);
    });
  }
}
