import { Module } from '@nestjs/common';
import { RECONCILIATION_REPOSITORY } from '../../domain/operations/reconciliation-repository';
import { PrismaReconciliationRepository } from '../../infrastructure/persistence/repositories/prisma-reconciliation.repository';
import { AuditSearchQuery } from './application/audit-search.query';
import { LoanBookQuery } from './application/loan-book.query';
import { ReconcileVaultUseCase } from './application/reconcile-vault.use-case';
import { ReconciliationHistoryQuery } from './application/reconciliation-history.query';
import { PauseSystemUseCase } from './application/pause-system.use-case';
import { AdminController } from './http/admin.controller';

@Module({
  controllers: [AdminController],
  providers: [
    PauseSystemUseCase,
    AuditSearchQuery,
    ReconcileVaultUseCase,
    ReconciliationHistoryQuery,
    LoanBookQuery,
    { provide: RECONCILIATION_REPOSITORY, useClass: PrismaReconciliationRepository },
  ],
})
export class AdminApiModule {}
