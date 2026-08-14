import { randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import type { NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

@Injectable()
export class RequestLoggingMiddleware implements NestMiddleware {
  private readonly logger = new Logger('http');

  use(request: Request, response: Response, next: NextFunction): void {
    const suppliedCorrelationId = request.header('x-correlation-id');
    const correlationId =
      suppliedCorrelationId !== undefined && suppliedCorrelationId !== ''
        ? suppliedCorrelationId
        : randomUUID();
    response.setHeader('x-correlation-id', correlationId);
    const startedAt = process.hrtime.bigint();

    response.on('finish', () => {
      const durationMs = Number((process.hrtime.bigint() - startedAt) / 1_000_000n);
      this.logger.log(
        `${request.method} ${request.originalUrl} ${response.statusCode} ${durationMs}ms ${correlationId}`,
      );
    });

    next();
  }
}
