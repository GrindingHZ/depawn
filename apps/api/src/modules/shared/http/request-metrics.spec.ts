import { describe, expect, it } from 'vitest';
import { RequestMetrics, normaliseRoute } from './request-metrics';

describe('normaliseRoute', () => {
  /* One bucket per loan would make the whole thing useless, so what is
     counted is the shape of the route rather than the path that was asked
     for. */
  it('collapses identifiers so a route is one bucket, not one per resource', () => {
    expect(normaliseRoute('GET', '/api/v1/loans/01JBQ7M8ZK9XQ4V2N6T5R3C1WD')).toBe(
      'GET /api/v1/loans/:id',
    );
    expect(normaliseRoute('POST', '/api/v1/listings/L-abc123/offers')).toBe(
      'POST /api/v1/listings/:id/offers',
    );
    expect(normaliseRoute('GET', '/api/v1/receipts/42')).toBe('GET /api/v1/receipts/:id');
    expect(
      normaliseRoute('POST', '/api/v1/liquidations/9c3f1d2e-0b6a-4c7d-8e5f-1a2b3c4d5e6f/close'),
    ).toBe('POST /api/v1/liquidations/:id/close');
  });

  it('leaves a route with no identifier alone and drops the query', () => {
    expect(normaliseRoute('GET', '/api/v1/admin/loan-book?page=2')).toBe(
      'GET /api/v1/admin/loan-book',
    );
  });
});

describe('RequestMetrics', () => {
  it('reports count, average, and worst case per route', () => {
    const metrics = new RequestMetrics();
    metrics.record('GET /api/v1/health', 200, 2);
    metrics.record('GET /api/v1/health', 200, 8);
    metrics.record('GET /api/v1/health', 200, 5);

    const [health] = metrics.snapshot();
    expect(health?.count).toBe(3);
    expect(health?.totalDurationMs).toBe(15);
    expect(health?.averageDurationMs).toBe(5);
    expect(health?.maxDurationMs).toBe(8);
    expect(health?.errorCount).toBe(0);
  });

  /* A refused request is the product working. Only a fault is a fault. */
  it('counts faults but not refusals as errors', () => {
    const metrics = new RequestMetrics();
    metrics.record('POST /api/v1/listings', 422, 3);
    metrics.record('POST /api/v1/listings', 403, 3);
    metrics.record('POST /api/v1/listings', 500, 3);

    expect(metrics.snapshot()[0]?.errorCount).toBe(1);
  });

  it('puts the busiest route first', () => {
    const metrics = new RequestMetrics();
    metrics.record('GET /api/v1/quiet', 200, 1);
    metrics.record('GET /api/v1/busy', 200, 1);
    metrics.record('GET /api/v1/busy', 200, 1);

    expect(metrics.snapshot().map((row) => row.route)).toEqual([
      'GET /api/v1/busy',
      'GET /api/v1/quiet',
    ]);
  });

  it('answers with nothing before anything has been served', () => {
    expect(new RequestMetrics().snapshot()).toEqual([]);
  });
});
