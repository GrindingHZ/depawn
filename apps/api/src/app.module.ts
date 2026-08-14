import { Module } from '@nestjs/common';
import { PersistenceModule } from './infrastructure/persistence/persistence.module';
import { HealthModule } from './modules/health/health.module';

@Module({
  imports: [PersistenceModule, HealthModule],
})
export class AppModule {}
