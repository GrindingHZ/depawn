import { createHash } from 'node:crypto';
import { ConflictException, Inject, Injectable } from '@nestjs/common';
import type { CallHandler, ExecutionContext, NestInterceptor } from '@nestjs/common';
import type { Response } from 'express';
import { from, mergeMap, of } from 'rxjs';
import type { Observable } from 'rxjs';
import { CLOCK_PORT } from '../../../domain/ports/clock.port';
import type { ClockPort } from '../../../domain/ports/clock.port';
import { IDEMPOTENCY_STORE } from '../../../domain/ports/idempotency-store.port';
import type { IdempotencyStore } from '../../../domain/ports/idempotency-store.port';
import type { AuthenticatedRequest } from './current-account.decorator';

const replayWindowMs = 24n * 60n * 60n * 1000n;

/* Applied per write endpoint. A repeat of the same key replays the stored
   response; the same key with a different payload is a client error. */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(
    @Inject(IDEMPOTENCY_STORE) private readonly store: IdempotencyStore,
    @Inject(CLOCK_PORT) private readonly clock: ClockPort,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const response = context.switchToHttp().getResponse<Response>();
    const key = request.header('idempotency-key');
    const account = request.account;

    if (key === undefined || key === '' || account === undefined) {
      return next.handle();
    }

    const requestHash = createHash('sha256')
      .update(`${request.method} ${request.originalUrl} ${JSON.stringify(request.body ?? null)}`)
      .digest('hex');
    const now = this.clock.now();

    return from(this.store.find(key, account.id, now)).pipe(
      mergeMap((existing) => {
        if (existing !== null) {
          if (existing.requestHash !== requestHash) {
            throw new ConflictException({
              error: {
                code: 'IDEMPOTENCY_KEY_REUSED',
                message: 'This idempotency key was already used for a different request.',
              },
            });
          }
          response.status(existing.statusCode);
          return of(existing.responseBody);
        }

        return next
          .handle()
          .pipe(
            mergeMap((body) =>
              from(
                this.store.save(
                  key,
                  account.id,
                  { requestHash, statusCode: response.statusCode, responseBody: body ?? null },
                  now.plusMilliseconds(replayWindowMs),
                ),
              ).pipe(mergeMap(() => of(body))),
            ),
          );
      }),
    );
  }
}
