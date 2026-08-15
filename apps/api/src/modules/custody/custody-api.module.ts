import { Module } from '@nestjs/common';
import { ACCOUNT_REPOSITORY } from '../../domain/accounts/account-repository';
import { REDEMPTION_REQUEST_REPOSITORY } from '../../domain/custody/redemption-request-repository';
import { PROTOCOL_PARAMETERS } from '../../domain/marketplace/protocol-parameters';
import type { ProtocolParameters } from '../../domain/marketplace/protocol-parameters';
import { PrismaAccountRepository } from '../../infrastructure/persistence/repositories/prisma-account.repository';
import { PrismaRedemptionRequestRepository } from '../../infrastructure/persistence/repositories/prisma-redemption-request.repository';
import { AttachPhotoUseCase } from './application/attach-photo.use-case';
import { ConfirmReleaseUseCase } from './application/confirm-release.use-case';
import { BeginIntakeUseCase } from './application/begin-intake.use-case';
import { IntakeDetailQuery } from './application/intake-detail.query';
import { DUAL_APPRAISAL_THRESHOLD } from './application/intake-tokens';
import { IssueReceiptUseCase } from './application/issue-receipt.use-case';
import { MemberReceiptsQuery } from './application/member-receipts.query';
import { RecordAppraisalUseCase } from './application/record-appraisal.use-case';
import { RedemptionQueueQuery } from './application/redemption-queue.query';
import { RequestRedemptionUseCase } from './application/request-redemption.use-case';
import { SealIntakeUseCase } from './application/seal-intake.use-case';
import { UpdateIntakeUseCase } from './application/update-intake.use-case';
import { VaultExposureQuery } from './application/vault-exposure.query';
import { VaultInventoryQuery } from './application/vault-inventory.query';
import { VerifyRedemptionUseCase } from './application/verify-redemption.use-case';
import { IntakeController } from './http/intake.controller';
import { ReceiptController } from './http/receipt.controller';
import { RedemptionController } from './http/redemption.controller';
import { VaultController } from './http/vault.controller';

@Module({
  controllers: [VaultController, IntakeController, ReceiptController, RedemptionController],
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
    RequestRedemptionUseCase,
    VerifyRedemptionUseCase,
    ConfirmReleaseUseCase,
    RedemptionQueueQuery,
    { provide: REDEMPTION_REQUEST_REPOSITORY, useClass: PrismaRedemptionRequestRepository },
    { provide: ACCOUNT_REPOSITORY, useClass: PrismaAccountRepository },
    {
      provide: DUAL_APPRAISAL_THRESHOLD,
      useFactory: (parameters: ProtocolParameters) => parameters.dualAppraisalThreshold,
      inject: [PROTOCOL_PARAMETERS],
    },
  ],
})
export class CustodyApiModule {}
