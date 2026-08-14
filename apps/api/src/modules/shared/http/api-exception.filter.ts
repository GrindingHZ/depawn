import { ArgumentsHost, Catch, HttpException, Logger } from '@nestjs/common';
import type { ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';
import { DomainErrorHttpException } from './domain-error-http.exception';
import type { ErrorEnvelope } from './domain-error-http.exception';

const codeByStatus: Record<number, string> = {
  401: 'UNAUTHENTICATED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
};

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();

    if (exception instanceof DomainErrorHttpException) {
      response.status(exception.getStatus()).json(exception.getResponse());
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const envelope: ErrorEnvelope = {
        error: { code: codeByStatus[status] ?? 'FAULT', message: exception.message },
      };
      response.status(status).json(envelope);
      return;
    }

    this.logger.error(
      exception instanceof Error ? (exception.stack ?? exception.message) : exception,
    );
    const envelope: ErrorEnvelope = {
      error: { code: 'FAULT', message: 'The request failed. Try again.' },
    };
    response.status(500).json(envelope);
  }
}
