import { describe, expect, it } from 'vitest';
import { bestRateSeries } from './rate-series';

function at(iso: string, basisPoints: number) {
  return { createdAt: iso, annualPercentageRateBasisPoints: basisPoints };
}

describe('bestRateSeries', () => {
  it('has no points for an empty book', () => {
    expect(bestRateSeries([])).toEqual([]);
  });

  it('plots a single offer as one point', () => {
    const series = bestRateSeries([at('2026-08-19T09:00:00.000Z', 1200)]);
    expect(series).toHaveLength(1);
    expect(series[0]?.basisPoints).toBe(1200);
  });

  it('follows the running best downwards', () => {
    const series = bestRateSeries([
      at('2026-08-19T09:00:00.000Z', 1200),
      at('2026-08-19T10:00:00.000Z', 1180),
      at('2026-08-19T11:00:00.000Z', 1120),
    ]);
    expect(series.map((point) => point.basisPoints)).toEqual([1200, 1180, 1120]);
  });

  /* An offer nobody would take has not moved the price, so it is not a point
     on a chart of the price. */
  it('ignores an offer worse than the standing best', () => {
    const series = bestRateSeries([
      at('2026-08-19T09:00:00.000Z', 1120),
      at('2026-08-19T10:00:00.000Z', 1400),
      at('2026-08-19T11:00:00.000Z', 1300),
    ]);
    expect(series.map((point) => point.basisPoints)).toEqual([1120]);
  });

  it('never rises, whatever order the offers arrive in', () => {
    const series = bestRateSeries([
      at('2026-08-19T11:00:00.000Z', 1120),
      at('2026-08-19T09:00:00.000Z', 1200),
      at('2026-08-19T10:00:00.000Z', 1180),
    ]);
    const rates = series.map((point) => point.basisPoints);
    expect(rates).toEqual([...rates].sort((left, right) => right - left));
  });

  it('ignores an equal offer, which did not improve anything', () => {
    const series = bestRateSeries([
      at('2026-08-19T09:00:00.000Z', 1120),
      at('2026-08-19T10:00:00.000Z', 1120),
    ]);
    expect(series).toHaveLength(1);
  });

  it('drops an unparseable timestamp rather than plotting it at the epoch', () => {
    const series = bestRateSeries([at('not a date', 1120), at('2026-08-19T09:00:00.000Z', 1200)]);
    expect(series.map((point) => point.basisPoints)).toEqual([1200]);
  });

  it('leaves the caller array alone', () => {
    const input = [at('2026-08-19T11:00:00.000Z', 1120), at('2026-08-19T09:00:00.000Z', 1200)];
    bestRateSeries(input);
    expect(input[0]?.annualPercentageRateBasisPoints).toBe(1120);
  });
});
