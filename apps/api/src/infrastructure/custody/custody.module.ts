import { Global, Module } from '@nestjs/common';
import { APPRAISAL_REPOSITORY } from '../../domain/custody/appraisal-repository';
import { CUSTODY_RECEIPT_REPOSITORY } from '../../domain/custody/custody-receipt-repository';
import { INTAKE_RECORD_REPOSITORY } from '../../domain/custody/intake-record-repository';
import { VAULT_REPOSITORY } from '../../domain/custody/vault-repository';
import { CUSTODY_PORT } from '../../domain/ports/custody.port';
import { PrismaAppraisalRepository } from '../persistence/repositories/prisma-appraisal.repository';
import { PrismaCustodyReceiptRepository } from '../persistence/repositories/prisma-custody-receipt.repository';
import { PrismaIntakeRecordRepository } from '../persistence/repositories/prisma-intake-record.repository';
import { PrismaVaultRepository } from '../persistence/repositories/prisma-vault.repository';
import { DatabaseCustodyAdapter } from './database-custody.adapter';

@Global()
@Module({
  providers: [
    PrismaVaultRepository,
    PrismaIntakeRecordRepository,
    PrismaAppraisalRepository,
    PrismaCustodyReceiptRepository,
    DatabaseCustodyAdapter,
    { provide: VAULT_REPOSITORY, useClass: PrismaVaultRepository },
    { provide: INTAKE_RECORD_REPOSITORY, useClass: PrismaIntakeRecordRepository },
    { provide: APPRAISAL_REPOSITORY, useClass: PrismaAppraisalRepository },
    { provide: CUSTODY_RECEIPT_REPOSITORY, useClass: PrismaCustodyReceiptRepository },
    { provide: CUSTODY_PORT, useClass: DatabaseCustodyAdapter },
  ],
  exports: [
    CUSTODY_PORT,
    DatabaseCustodyAdapter,
    VAULT_REPOSITORY,
    INTAKE_RECORD_REPOSITORY,
    APPRAISAL_REPOSITORY,
    CUSTODY_RECEIPT_REPOSITORY,
  ],
})
export class CustodyModule {}
