import { Module } from '@nestjs/common';
import type { MiddlewareConsumer, NestModule } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { ClockModule } from './infrastructure/clock/clock.module';
import { CustodyModule } from './infrastructure/custody/custody.module';
import { ProtocolParametersModule } from './infrastructure/parameters/protocol-parameters.module';
import { PlatformServicesModule } from './infrastructure/platform-services.module';
import { PersistenceModule } from './infrastructure/persistence/persistence.module';
import { SettlementModule } from './infrastructure/settlement/settlement.module';
import { AccountsModule } from './modules/accounts/accounts.module';
import { CustodyApiModule } from './modules/custody/custody-api.module';
import { HealthModule } from './modules/health/health.module';
import { LedgerModule } from './modules/ledger/ledger.module';
import { LendingApiModule } from './modules/lending/lending-api.module';
import { MarketplaceApiModule } from './modules/marketplace/marketplace-api.module';
import { SharedHttpModule } from './modules/shared/shared-http.module';
import { TestSupportModule } from './modules/test-support/test-support.module';
import { ApiExceptionFilter } from './modules/shared/http/api-exception.filter';
import { RequestLoggingMiddleware } from './modules/shared/http/request-logging.middleware';

/* The test support routes exist in the graph only under NODE_ENV=test, so a
   deployed process has no way to move its own clock. */
const testOnlyModules = process.env.NODE_ENV === 'test' ? [TestSupportModule] : [];

@Module({
  imports: [
    ClockModule,
    PersistenceModule,
    SettlementModule,
    CustodyModule,
    PlatformServicesModule,
    ProtocolParametersModule,
    SharedHttpModule,
    AccountsModule,
    LedgerModule,
    CustodyApiModule,
    MarketplaceApiModule,
    LendingApiModule,
    HealthModule,
    ...testOnlyModules,
  ],
  providers: [{ provide: APP_FILTER, useClass: ApiExceptionFilter }],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestLoggingMiddleware).forRoutes('{*splat}');
  }
}
