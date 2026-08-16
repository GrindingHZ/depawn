import { Injectable } from '@nestjs/common';

export interface RouteMetric {
  readonly route: string;
  readonly count: number;
  readonly errorCount: number;
  readonly totalDurationMs: number;
  readonly maxDurationMs: number;
  readonly averageDurationMs: number;
}

interface MutableMetric {
  count: number;
  errorCount: number;
  totalDurationMs: number;
  maxDurationMs: number;
}

/* Identifiers in a path would give one bucket per loan, so the shape of the
   route is what is counted. Anything that looks like an id becomes a colon
   placeholder, which is close enough to the route as declared. */
const identifierPattern = /^(?:[0-9A-HJKMNP-TV-Z]{26}|[0-9a-f-]{36}|\d+|[A-Z]+-[A-Za-z0-9-]+)$/;

export function normaliseRoute(method: string, url: string): string {
  const path = url.split('?')[0] ?? url;
  const shape = path
    .split('/')
    .map((segment) => (identifierPattern.test(segment) ? ':id' : segment))
    .join('/');
  return `${method} ${shape}`;
}

/* Counts, not a time series. The question a demo has to answer is which
   endpoint is slow and which is failing, and a running total answers both
   without a metrics backend to run alongside three apps and a database. */
@Injectable()
export class RequestMetrics {
  private readonly metrics = new Map<string, MutableMetric>();

  record(route: string, statusCode: number, durationMs: number): void {
    const existing = this.metrics.get(route) ?? {
      count: 0,
      errorCount: 0,
      totalDurationMs: 0,
      maxDurationMs: 0,
    };
    existing.count += 1;
    existing.errorCount += statusCode >= 500 ? 1 : 0;
    existing.totalDurationMs += durationMs;
    existing.maxDurationMs = Math.max(existing.maxDurationMs, durationMs);
    this.metrics.set(route, existing);
  }

  /* Busiest first, because the first question is always where the traffic
     is and the second is what it costs. */
  snapshot(): readonly RouteMetric[] {
    return [...this.metrics.entries()]
      .map(([route, metric]) => ({
        route,
        count: metric.count,
        errorCount: metric.errorCount,
        totalDurationMs: metric.totalDurationMs,
        maxDurationMs: metric.maxDurationMs,
        averageDurationMs: Math.round(metric.totalDurationMs / metric.count),
      }))
      .sort((left, right) => right.count - left.count);
  }
}
