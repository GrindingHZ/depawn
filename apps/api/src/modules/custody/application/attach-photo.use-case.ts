import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { IntakeAlreadySealed } from '../../../domain/custody/intake-already-sealed';
import { IntakeNotFound } from '../../../domain/custody/intake-not-found';
import { acceptPhotograph } from '../../../domain/custody/photograph';
import type { PhotographRejected } from '../../../domain/custody/photograph-rejected';
import type { EvidenceItem } from '../../../domain/custody/intake-record';
import { INTAKE_RECORD_REPOSITORY } from '../../../domain/custody/intake-record-repository';
import type { IntakeRecordRepository } from '../../../domain/custody/intake-record-repository';
import { AUDIT_PORT } from '../../../domain/ports/audit.port';
import type { AuditPort } from '../../../domain/ports/audit.port';
import { OBJECT_STORAGE_PORT } from '../../../domain/ports/object-storage.port';
import type { ObjectStoragePort } from '../../../domain/ports/object-storage.port';
import { UNIT_OF_WORK } from '../../../domain/ports/unit-of-work';
import type { UnitOfWork } from '../../../domain/ports/unit-of-work';
import type { AccountId, IntakeId } from '../../../domain/shared/identifiers';
import { failure, ok } from '../../../domain/shared/result';
import type { Result } from '../../../domain/shared/result';

export interface AttachPhotoCommand {
  readonly intakeId: IntakeId;
  readonly requestedBy: AccountId;
  readonly fileName: string;
  readonly bytes: Uint8Array;
}

@Injectable()
export class AttachPhotoUseCase {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    @Inject(INTAKE_RECORD_REPOSITORY) private readonly intakes: IntakeRecordRepository,
    @Inject(OBJECT_STORAGE_PORT) private readonly storage: ObjectStoragePort,
    @Inject(AUDIT_PORT) private readonly audit: AuditPort,
  ) {}

  execute(
    command: AttachPhotoCommand,
  ): Promise<Result<EvidenceItem, IntakeNotFound | IntakeAlreadySealed | PhotographRejected>> {
    return this.unitOfWork.run(async (context) => {
      const intake = await this.intakes.findById(command.intakeId, context);
      if (intake === null) {
        return failure(new IntakeNotFound());
      }

      /* Before anything is hashed or written. The bytes decide what this is;
         the file name is only ever a label for staff to recognise. */
      const accepted = acceptPhotograph(command.bytes);
      if (!accepted.ok) {
        return accepted;
      }

      const contentHash = createHash('sha256').update(command.bytes).digest('hex');
      const item: EvidenceItem = {
        label: command.fileName,
        contentHash,
        contentType: accepted.value.contentType,
        byteLength: accepted.value.byteLength,
      };
      const withEvidence = intake.attachEvidence([item]);
      if (!withEvidence.ok) {
        return withEvidence;
      }

      await this.storage.put(`intakes/${command.intakeId}/${contentHash}`, command.bytes);
      await this.intakes.save(withEvidence.value, context);
      await this.audit.record(
        {
          actorType: 'ACCOUNT',
          actorId: command.requestedBy,
          subjectType: 'intake_record',
          subjectId: intake.id,
          action: 'attach_photo',
          after: item,
        },
        context,
      );
      return ok(item);
    });
  }
}
