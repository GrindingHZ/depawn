import { Module } from '@nestjs/common';
import { AuditSearchQuery } from './application/audit-search.query';
import { PauseSystemUseCase } from './application/pause-system.use-case';
import { AdminController } from './http/admin.controller';

@Module({
  controllers: [AdminController],
  providers: [PauseSystemUseCase, AuditSearchQuery],
})
export class AdminApiModule {}
