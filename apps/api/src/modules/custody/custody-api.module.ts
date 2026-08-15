import { Module } from '@nestjs/common';
import { ACCOUNT_REPOSITORY } from '../../domain/accounts/account-repository';
import { PrismaAccountRepository } from '../../infrastructure/persistence/repositories/prisma-account.repository';
import { Money, currencyOf } from '../../domain/shared/money';
import { AttachPhotoUseCase } from './application/attach-photo.use-case';
import { BeginIntakeUseCase } from './application/begin-intake.use-case';
import { IntakeDetailQuery } from './application/intake-detail.query';
import { DUAL_APPRAISAL_THRESHOLD } from './application/intake-tokens';
import { IssueReceiptUseCase } from './application/issue-receipt.use-case';
import { MemberReceiptsQuery } from './application/member-receipts.query';
import { RecordAppraisalUseCase } from './application/record-appraisal.use-case';
import { SealIntakeUseCase } from './application/seal-intake.use-case';
import { UpdateIntakeUseCase } from './application/update-intake.use-case';
import { VaultExposureQuery } from './application/vault-exposure.query';
import { VaultInventoryQuery } from './application/vault-inventory.query';
import { IntakeController } from './http/intake.controller';
import { ReceiptController } from './http/receipt.controller';
import { VaultController } from './http/vault.controller';

@Module({
  controllers: [VaultController, IntakeController, ReceiptController],
  providers: [
    BeginIntakeUseCase,
    UpdateIntakeUseCase,
    AttachPhotoUseCase,
    RecordAppraisalUseCase,
    SealIntakeUseCase,
    IssueReceiptUseCase,
    IntakeDetailQuery,
    VaultInventoryQuery,
    VaultExposureQuery,
    MemberReceiptsQuery,
    { provide: ACCOUNT_REPOSITORY, useClass: PrismaAccountRepository },
    // Ten million minor units keeps the demo path single appraisal (Q-005).
    { provide: DUAL_APPRAISAL_THRESHOLD, useValue: Money.of(10_000_000n, currencyOf('AUD')) },
  ],
})
export class CustodyApiModule {}
