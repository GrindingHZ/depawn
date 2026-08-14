import { createHash } from 'node:crypto';
import { ConflictException, Inject, Injectable } from '@nestjs/common';
import type { CallHandler, ExecutionContext, NestInterceptor } from '@nestjs/common';
import type { Response } from 'express';
import { catchError, from, mergeMap, of, throwError } from 'rxjs';
import type { Observable } from 'rxjs';
import { CLOCK_PORT } from '../../../domain/ports/clock.port';
import type { ClockPort } from '../../../domain/ports/clock.port';
import { IDEMPOTENCY_STORE } from '../../../domain/ports/idempotency-store.port';
import type { IdempotencyStore } from '../../../domain/ports/idempotency-store.port';
import type { AccountId } from '../../../domain/shared/identifiers';
import type { AuthenticatedRequest } from './current-account.decorator';

const replayWindowMs = 24n * 60n * 60n * 1000n;

/* Applied per write endpoint. The key is claimed before the handler runs, so
   a retry racing its original, or arriving after a crash mid flight, can
   never move money twice. A crashed claim stays pending until it expires;
   that trades a stuck key for the guarantee that a repeat never re-executes. */
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

    return from(
      this.store.claim(key, account.id, requestHash, now, now.plusMilliseconds(replayWindowMs)),
    ).pipe(
      mergeMap((claim) => {
        if (claim.outcome === 'mismatch') {
          throw new ConflictException({
            error: {
              code: 'IDEMPOTENCY_KEY_REUSED',
              message: 'This idempotency key was already used for a different request.',
            },
          });
        }
        if (claim.outcome === 'in-progress') {
          throw new ConflictException({
            error: {
              code: 'IDEMPOTENCY_KEY_REUSED',
              message: 'A request with this idempotency key is still being processed.',
            },
          });
        }
        if (claim.outcome === 'completed') {
          response.status(claim.response.statusCode);
          return of(claim.response.responseBody);
        }
        return this.executeAndComplete(key, account.id, next, response);
      }),
    );
  }

  private executeAndComplete(
    key: string,
    accountId: AccountId,
    next: CallHandler,
    response: Response,
  ): Observable<unknown> {
    return next.handle().pipe(
      mergeMap((body) =>
        from(
          this.store.complete(key, accountId, {
            statusCode: response.statusCode,
            responseBody: body ?? null,
          }),
        ).pipe(mergeMap(() => of(body))),
      ),
      catchError((error: unknown) =>
        // A failed request releases the key so the client can retry it.
        from(this.store.release(key, accountId)).pipe(mergeMap(() => throwError(() => error))),
      ),
    );
  }
}
