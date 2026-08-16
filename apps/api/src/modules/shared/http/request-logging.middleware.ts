import { randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import type { NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { RequestMetrics, normaliseRoute } from './request-metrics';

/* One JSON object per request. Structured rather than a sentence, because
   the first thing anyone does with a log line is filter it, and a format
   that has to be parsed with a regular expression is a format that will be
   parsed wrongly. */
@Injectable()
export class RequestLoggingMiddleware implements NestMiddleware {
  private readonly logger = new Logger('http');

  constructor(private readonly metrics: RequestMetrics) {}

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
      const route = normaliseRoute(request.method, request.originalUrl);
      this.metrics.record(route, response.statusCode, durationMs);
      this.logger.log(
        JSON.stringify({
          method: request.method,
          path: request.originalUrl,
          route,
          status: response.statusCode,
          durationMs,
          correlationId,
        }),
      );
    });

    next();
  }
}
