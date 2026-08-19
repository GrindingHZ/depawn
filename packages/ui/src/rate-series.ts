/* What the borrower's cost has done since the listing opened.

   Not every offer: the running best. A lender quoting worse than the standing
   best has changed nothing about what the borrower would pay, so plotting it
   would draw a line that jumps around while the actual price held steady. */

export interface SeriesInput {
  readonly createdAt: string;
  readonly annualPercentageRateBasisPoints: number;
}

export interface RatePoint {
  readonly atEpochMs: number;
  readonly basisPoints: number;
}

export function bestRateSeries(offers: readonly SeriesInput[]): readonly RatePoint[] {
  const chronological = [...offers]
    .map((offer) => ({
      atEpochMs: Date.parse(offer.createdAt),
      basisPoints: offer.annualPercentageRateBasisPoints,
    }))
    .filter((point) => Number.isFinite(point.atEpochMs))
    .sort((left, right) => left.atEpochMs - right.atEpochMs);

  const points: RatePoint[] = [];
  let best: number | null = null;
  for (const point of chronological) {
    if (best === null || point.basisPoints < best) {
      best = point.basisPoints;
      points.push(point);
    }
  }
  return points;
}
