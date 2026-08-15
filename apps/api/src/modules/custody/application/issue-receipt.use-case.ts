import { Inject, Injectable } from '@nestjs/common';
import { APPRAISAL_REPOSITORY } from '../../../domain/custody/appraisal-repository';
import type { AppraisalRepository } from '../../../domain/custody/appraisal-repository';
import type { CustodyReceipt } from '../../../domain/custody/custody-receipt';
import { CUSTODY_RECEIPT_REPOSITORY } from '../../../domain/custody/custody-receipt-repository';
import type { CustodyReceiptRepository } from '../../../domain/custody/custody-receipt-repository';
import { IntakeIncomplete } from '../../../domain/custody/intake-incomplete';
import { IntakeNotFound } from '../../../domain/custody/intake-not-found';
import { IntakeNotSealed } from '../../../domain/custody/intake-not-sealed';
import { INTAKE_RECORD_REPOSITORY } from '../../../domain/custody/intake-record-repository';
import type { IntakeRecordRepository } from '../../../domain/custody/intake-record-repository';
import { assertWithinInsuredLimit } from '../../../domain/custody/vault-exposure-policy';
import type { VaultInsuredLimitExceeded } from '../../../domain/custody/vault-insured-limit-exceeded';
import { VaultNotFound } from '../../../domain/custody/vault-not-found';
import { VAULT_REPOSITORY } from '../../../domain/custody/vault-repository';
import type { VaultRepository } from '../../../domain/custody/vault-repository';
import { AUDIT_PORT } from '../../../domain/ports/audit.port';
import type { AuditPort } from '../../../domain/ports/audit.port';
import { CUSTODY_PORT } from '../../../domain/ports/custody.port';
import type { CustodyPort } from '../../../domain/ports/custody.port';
import { DOMAIN_EVENT_PUBLISHER } from '../../../domain/ports/domain-event-publisher.port';
import type { DomainEventPublisher } from '../../../domain/ports/domain-event-publisher.port';
import { UNIT_OF_WORK } from '../../../domain/ports/unit-of-work';
import type { UnitOfWork } from '../../../domain/ports/unit-of-work';
import type { AccountId, IntakeId } from '../../../domain/shared/identifiers';
import { failure, ok } from '../../../domain/shared/result';
import type { Result } from '../../../domain/shared/result';

export interface IssueReceiptCommand {
  readonly intakeId: IntakeId;
  readonly requestedBy: AccountId;
  readonly insurancePolicyReference: string;
}

type IssueRejection =
  IntakeNotFound | IntakeNotSealed | IntakeIncomplete | VaultNotFound | VaultInsuredLimitExceeded;

@Injectable()
export class IssueReceiptUseCase {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    @Inject(INTAKE_RECORD_REPOSITORY) private readonly intakes: IntakeRecordRepository,
    @Inject(APPRAISAL_REPOSITORY) private readonly appraisals: AppraisalRepository,
    @Inject(VAULT_REPOSITORY) private readonly vaults: VaultRepository,
    @Inject(CUSTODY_RECEIPT_REPOSITORY) private readonly receipts: CustodyReceiptRepository,
    @Inject(CUSTODY_PORT) private readonly custody: CustodyPort,
    @Inject(DOMAIN_EVENT_PUBLISHER) private readonly events: DomainEventPublisher,
    @Inject(AUDIT_PORT) private readonly audit: AuditPort,
  ) {}

  execute(command: IssueReceiptCommand): Promise<Result<CustodyReceipt, IssueRejection>> {
    return this.unitOfWork.run(async (context) => {
      const intake = await this.intakes.findById(command.intakeId, context);
      if (intake === null) {
        return failure(new IntakeNotFound());
      }
      if (!intake.isSealed || intake.sealedHash === null) {
        return failure(new IntakeNotSealed());
      }

      const vault = await this.vaults.findById(intake.vaultId, context);
      if (vault === null) {
        return failure(new VaultNotFound());
      }
      const appraisals = await this.appraisals.listByIntake(command.intakeId, context);
      const appraisal = appraisals[appraisals.length - 1];
      if (appraisal === undefined) {
        return failure(new IntakeIncomplete('The intake has no appraisal.'));
      }

      // The lock comes before both the replay check and the exposure read so
      // two issuances serialise: a racing repeat blocks here, then sees the
      // winner's committed receipt and replays it. Rule C5 cannot be raced
      // past for the same reason, and the unique index on the intake hash is
      // the database backstop.
      await this.vaults.lock(vault.id, context);
      const existing = await this.receipts.findByIntakeRecordHash(intake.sealedHash, context);
      if (existing !== null) {
        return ok(existing);
      }
      const exposure = await this.receipts.exposureOf(vault.id, appraisal.value.currency, context);
      const withinLimit = assertWithinInsuredLimit(exposure, appraisal.value, vault.insuredLimit);
      if (!withinLimit.ok) {
        return withinLimit;
      }

      const receipt = await this.custody.issueReceipt(
        {
          vaultId: vault.id,
          holderAccountId: intake.borrowerAccountId,
          intakeRecordHash: intake.sealedHash,
          appraisedValue: appraisal.value,
          appraisedAt: appraisal.appraisedAt,
          appraiserId: appraisal.appraiserId,
          itemCategory: intake.itemCategory,
          insurancePolicyReference: command.insurancePolicyReference,
        },
        context,
      );

      await this.events.publish(
        [
          {
            type: 'ReceiptIssued',
            receiptId: receipt.id,
            vaultId: vault.id,
            appraisedValue: receipt.appraisedValue,
          },
        ],
        context,
      );
      await this.audit.record(
        {
          actorType: 'ACCOUNT',
          actorId: command.requestedBy,
          subjectType: 'custody_receipt',
          subjectId: receipt.id,
          action: 'issue_receipt',
          after: {
            intakeId: intake.id,
            holderAccountId: receipt.holderAccountId,
            appraisedValueMinorUnits: receipt.appraisedValue.minorUnits.toString(),
          },
        },
        context,
      );
      return ok(receipt);
    });
  }
}
