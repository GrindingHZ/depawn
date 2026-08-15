import { Module } from '@nestjs/common';
import type { MiddlewareConsumer, NestModule } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { ClockModule } from './infrastructure/clock/clock.module';
import { CustodyModule } from './infrastructure/custody/custody.module';
import { PlatformServicesModule } from './infrastructure/platform-services.module';
import { PersistenceModule } from './infrastructure/persistence/persistence.module';
import { SettlementModule } from './infrastructure/settlement/settlement.module';
import { AccountsModule } from './modules/accounts/accounts.module';
import { CustodyApiModule } from './modules/custody/custody-api.module';
import { HealthModule } from './modules/health/health.module';
import { LedgerModule } from './modules/ledger/ledger.module';
import { SharedHttpModule } from './modules/shared/shared-http.module';
import { ApiExceptionFilter } from './modules/shared/http/api-exception.filter';
import { RequestLoggingMiddleware } from './modules/shared/http/request-logging.middleware';

@Module({
  imports: [
    ClockModule,
    PersistenceModule,
    SettlementModule,
    CustodyModule,
    PlatformServicesModule,
    SharedHttpModule,
    AccountsModule,
    LedgerModule,
    CustodyApiModule,
    HealthModule,
  ],
  providers: [{ provide: APP_FILTER, useClass: ApiExceptionFilter }],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestLoggingMiddleware).forRoutes('{*splat}');
  }
}
