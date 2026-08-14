import type { AppraisalId, IntakeId, StaffId } from '../shared/identifiers';
import type { Instant } from '../shared/instant';
import type { Money } from '../shared/money';

export class Appraisal {
  private constructor(
    readonly id: AppraisalId,
    readonly intakeId: IntakeId,
    readonly appraiserId: StaffId,
    readonly value: Money,
    readonly method: string,
    readonly comparableReferences: string,
    readonly appraisedAt: Instant,
  ) {}

  static create(input: {
    id: AppraisalId;
    intakeId: IntakeId;
    appraiserId: StaffId;
    value: Money;
    method: string;
    comparableReferences: string;
    appraisedAt: Instant;
  }): Appraisal {
    return new Appraisal(
      input.id,
      input.intakeId,
      input.appraiserId,
      input.value,
      input.method,
      input.comparableReferences,
      input.appraisedAt,
    );
  }

  static restore(input: {
    id: AppraisalId;
    intakeId: IntakeId;
    appraiserId: StaffId;
    value: Money;
    method: string;
    comparableReferences: string;
    appraisedAt: Instant;
  }): Appraisal {
    return Appraisal.create(input);
  }
}
