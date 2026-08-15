import { Inject, Injectable } from '@nestjs/common';
import type { Appraisal } from '../../../domain/custody/appraisal';
import { APPRAISAL_REPOSITORY } from '../../../domain/custody/appraisal-repository';
import type { AppraisalRepository } from '../../../domain/custody/appraisal-repository';
import type { IntakeRecord } from '../../../domain/custody/intake-record';
import { INTAKE_RECORD_REPOSITORY } from '../../../domain/custody/intake-record-repository';
import type { IntakeRecordRepository } from '../../../domain/custody/intake-record-repository';
import { UNIT_OF_WORK } from '../../../domain/ports/unit-of-work';
import type { UnitOfWork } from '../../../domain/ports/unit-of-work';
import type { IntakeId } from '../../../domain/shared/identifiers';

export interface IntakeDetail {
  readonly intake: IntakeRecord;
  readonly appraisals: readonly Appraisal[];
}

@Injectable()
export class IntakeDetailQuery {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    @Inject(INTAKE_RECORD_REPOSITORY) private readonly intakes: IntakeRecordRepository,
    @Inject(APPRAISAL_REPOSITORY) private readonly appraisals: AppraisalRepository,
  ) {}

  read(intakeId: IntakeId): Promise<IntakeDetail | null> {
    return this.unitOfWork.run(async (context) => {
      const intake = await this.intakes.findById(intakeId, context);
      if (intake === null) {
        return null;
      }
      const appraisals = await this.appraisals.listByIntake(intakeId, context);
      return { intake, appraisals };
    });
  }
}
