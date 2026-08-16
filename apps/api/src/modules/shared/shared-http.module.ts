import { Global, Module } from '@nestjs/common';
import { IDEMPOTENCY_STORE } from '../../domain/ports/idempotency-store.port';
import { PrismaIdempotencyStore } from '../../infrastructure/persistence/prisma-idempotency-store';
import { IdempotencyInterceptor } from './http/idempotency.interceptor';
import { RequestMetrics } from './http/request-metrics';

@Global()
@Module({
  providers: [
    IdempotencyInterceptor,
    RequestMetrics,
    { provide: IDEMPOTENCY_STORE, useClass: PrismaIdempotencyStore },
  ],
  exports: [IdempotencyInterceptor, RequestMetrics, IDEMPOTENCY_STORE],
})
export class SharedHttpModule {}
