import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { PersistenceModule } from './infrastructure/persistence/persistence.module';
import { HealthModule } from './modules/health/health.module';
import { ApiExceptionFilter } from './modules/shared/http/api-exception.filter';

@Module({
  imports: [PersistenceModule, HealthModule],
  providers: [{ provide: APP_FILTER, useClass: ApiExceptionFilter }],
})
export class AppModule {}
