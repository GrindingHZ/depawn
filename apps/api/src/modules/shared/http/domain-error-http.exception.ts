import { HttpException } from '@nestjs/common';
import type { DomainError } from '../../../domain/shared/domain-error';

export interface ErrorEnvelope {
  readonly error: {
    readonly code: string;
    readonly message: string;
    readonly details?: unknown;
  };
}

/* Wraps an expected domain failure for the HTTP layer. Controllers convert a
   Result failure into this; the global filter serialises it unchanged. */
export class DomainErrorHttpException extends HttpException {
  constructor(domainError: DomainError, statusCode: number, details?: unknown) {
    const envelope: ErrorEnvelope = {
      error: {
        code: domainError.code,
        message: domainError.message,
        ...(details === undefined ? {} : { details }),
      },
    };
    super(envelope, statusCode);
  }
}
