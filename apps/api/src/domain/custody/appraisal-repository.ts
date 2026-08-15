import type { IntakeId } from '../shared/identifiers';
import type { UnitOfWorkContext } from '../ports/unit-of-work';
import type { Appraisal } from './appraisal';

export interface AppraisalRepository {
  listByIntake(intakeId: IntakeId, context: UnitOfWorkContext): Promise<readonly Appraisal[]>;
  save(appraisal: Appraisal, context: UnitOfWorkContext): Promise<void>;
}

export const APPRAISAL_REPOSITORY = Symbol('AppraisalRepository');
