import { Module } from '@nestjs/common';
import type { MiddlewareConsumer, NestModule } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { ClockModule } from './infrastructure/clock/clock.module';
import { PersistenceModule } from './infrastructure/persistence/persistence.module';
import { HealthModule } from './modules/health/health.module';
import { ApiExceptionFilter } from './modules/shared/http/api-exception.filter';
import { RequestLoggingMiddleware } from './modules/shared/http/request-logging.middleware';

@Module({
  imports: [ClockModule, PersistenceModule, HealthModule],
  providers: [{ provide: APP_FILTER, useClass: ApiExceptionFilter }],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestLoggingMiddleware).forRoutes('{*splat}');
  }
}
