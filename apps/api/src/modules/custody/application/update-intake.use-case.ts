import { Inject, Injectable } from '@nestjs/common';
import type { IntakeAlreadySealed } from '../../../domain/custody/intake-already-sealed';
import { IntakeNotFound } from '../../../domain/custody/intake-not-found';
import type { IntakeRecord } from '../../../domain/custody/intake-record';
import { INTAKE_RECORD_REPOSITORY } from '../../../domain/custody/intake-record-repository';
import type { IntakeRecordRepository } from '../../../domain/custody/intake-record-repository';
import { AUDIT_PORT } from '../../../domain/ports/audit.port';
import type { AuditPort } from '../../../domain/ports/audit.port';
import { UNIT_OF_WORK } from '../../../domain/ports/unit-of-work';
import type { UnitOfWork } from '../../../domain/ports/unit-of-work';
import type { AccountId, IntakeId } from '../../../domain/shared/identifiers';
import { failure, ok } from '../../../domain/shared/result';
import type { Result } from '../../../domain/shared/result';

export interface UpdateIntakeCommand {
  readonly intakeId: IntakeId;
  readonly requestedBy: AccountId;
  readonly itemDescription: string | undefined;
  readonly serialNumbers: readonly string[] | undefined;
  readonly sealNumber: string | undefined;
}

@Injectable()
export class UpdateIntakeUseCase {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    @Inject(INTAKE_RECORD_REPOSITORY) private readonly intakes: IntakeRecordRepository,
    @Inject(AUDIT_PORT) private readonly audit: AuditPort,
  ) {}

  execute(
    command: UpdateIntakeCommand,
  ): Promise<Result<IntakeRecord, IntakeNotFound | IntakeAlreadySealed>> {
    return this.unitOfWork.run(async (context) => {
      let intake = await this.intakes.findById(command.intakeId, context);
      if (intake === null) {
        return failure(new IntakeNotFound());
      }

      if (command.itemDescription !== undefined || command.serialNumbers !== undefined) {
        const described = intake.describeItem(
          command.itemDescription ?? intake.itemDescription,
          command.serialNumbers ?? intake.serialNumbers,
        );
        if (!described.ok) {
          return described;
        }
        intake = described.value;
      }
      if (command.sealNumber !== undefined) {
        const withSeal = intake.recordSealNumber(command.sealNumber);
        if (!withSeal.ok) {
          return withSeal;
        }
        intake = withSeal.value;
      }

      await this.intakes.save(intake, context);
      await this.audit.record(
        {
          actorType: 'ACCOUNT',
          actorId: command.requestedBy,
          subjectType: 'intake_record',
          subjectId: intake.id,
          action: 'update_intake',
          after: {
            itemDescription: intake.itemDescription,
            serialNumbers: intake.serialNumbers,
            sealNumber: intake.sealNumber,
          },
        },
        context,
      );
      return ok(intake);
    });
  }
}
