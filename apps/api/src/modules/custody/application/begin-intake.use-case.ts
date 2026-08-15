import { Inject, Injectable } from '@nestjs/common';
import { AccountNotFound } from '../../../domain/accounts/account-not-found';
import { ACCOUNT_REPOSITORY } from '../../../domain/accounts/account-repository';
import type { AccountRepository } from '../../../domain/accounts/account-repository';
import { IntakeRecord } from '../../../domain/custody/intake-record';
import { INTAKE_RECORD_REPOSITORY } from '../../../domain/custody/intake-record-repository';
import type { IntakeRecordRepository } from '../../../domain/custody/intake-record-repository';
import type { ItemCategory } from '../../../domain/custody/item-category';
import { VaultNotFound } from '../../../domain/custody/vault-not-found';
import { VAULT_REPOSITORY } from '../../../domain/custody/vault-repository';
import type { VaultRepository } from '../../../domain/custody/vault-repository';
import { AUDIT_PORT } from '../../../domain/ports/audit.port';
import type { AuditPort } from '../../../domain/ports/audit.port';
import { UNIT_OF_WORK } from '../../../domain/ports/unit-of-work';
import type { UnitOfWork } from '../../../domain/ports/unit-of-work';
import { ID_GENERATOR } from '../../../domain/shared/id-generator';
import type { IdGenerator } from '../../../domain/shared/id-generator';
import { intakeIdOf } from '../../../domain/shared/identifiers';
import type { AccountId, VaultId } from '../../../domain/shared/identifiers';
import { failure, ok } from '../../../domain/shared/result';
import type { Result } from '../../../domain/shared/result';

export interface BeginIntakeCommand {
  readonly vaultId: VaultId;
  readonly requestedBy: AccountId;
  readonly borrowerEmail: string;
  readonly itemCategory: ItemCategory;
  readonly itemDescription: string;
}

@Injectable()
export class BeginIntakeUseCase {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    @Inject(VAULT_REPOSITORY) private readonly vaults: VaultRepository,
    @Inject(ACCOUNT_REPOSITORY) private readonly accounts: AccountRepository,
    @Inject(INTAKE_RECORD_REPOSITORY) private readonly intakes: IntakeRecordRepository,
    @Inject(AUDIT_PORT) private readonly audit: AuditPort,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
  ) {}

  execute(
    command: BeginIntakeCommand,
  ): Promise<Result<IntakeRecord, VaultNotFound | AccountNotFound>> {
    return this.unitOfWork.run(async (context) => {
      const vault = await this.vaults.findById(command.vaultId, context);
      if (vault === null) {
        return failure(new VaultNotFound());
      }
      const borrower = await this.accounts.findByEmail(command.borrowerEmail, context);
      if (borrower === null) {
        return failure(new AccountNotFound());
      }

      const intake = IntakeRecord.begin({
        id: intakeIdOf(this.idGenerator.generate()),
        vaultId: command.vaultId,
        borrowerAccountId: borrower.id,
        itemCategory: command.itemCategory,
        itemDescription: command.itemDescription,
      });
      await this.intakes.save(intake, context);
      await this.audit.record(
        {
          actorType: 'ACCOUNT',
          actorId: command.requestedBy,
          subjectType: 'intake_record',
          subjectId: intake.id,
          action: 'begin_intake',
          after: { vaultId: command.vaultId, borrowerAccountId: borrower.id },
        },
        context,
      );
      return ok(intake);
    });
  }
}
