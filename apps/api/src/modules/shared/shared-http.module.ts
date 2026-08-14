import { Global, Module } from '@nestjs/common';
import { IDEMPOTENCY_STORE } from '../../domain/ports/idempotency-store.port';
import { PrismaIdempotencyStore } from '../../infrastructure/persistence/prisma-idempotency-store';
import { IdempotencyInterceptor } from './http/idempotency.interceptor';

@Global()
@Module({
  providers: [
    IdempotencyInterceptor,
    { provide: IDEMPOTENCY_STORE, useClass: PrismaIdempotencyStore },
  ],
  exports: [IdempotencyInterceptor, IDEMPOTENCY_STORE],
})
export class SharedHttpModule {}
