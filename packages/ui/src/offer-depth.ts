/* The offer book is a real order book: lenders compete by lowering the rate
   (docs/00-product-overview.md rule M4), so the best offer is the cheapest
   and depth accumulates from there down the list.

   Kept as a pure function away from the component because it is the part
   most likely to be wrong and the cheapest to test in isolation. */

export interface DepthInput {
  readonly id: string;
  readonly annualPercentageRateBasisPoints: number;
  readonly principal: { readonly minorUnits: string };
}

export interface DepthRow {
  readonly offerId: string;
  readonly annualPercentageRateBasisPoints: number;
  readonly principalMinorUnits: bigint;
  readonly cumulativeMinorUnits: bigint;
  /* Share of the deepest row, for the bar drawn behind the rate. A ratio and
     not a width, because how wide that becomes is the component's business. */
  readonly cumulativeShare: number;
  readonly isBest: boolean;
}

export function accumulateDepth(offers: readonly DepthInput[]): readonly DepthRow[] {
  if (offers.length === 0) {
    return [];
  }

  /* Sorting a copy: a caller handing us their query cache would otherwise
     watch their own array reorder underneath them. Ties keep submission
     order, which is how ranking already breaks them. */
  const ascending = [...offers].sort(
    (left, right) => left.annualPercentageRateBasisPoints - right.annualPercentageRateBasisPoints,
  );

  let running = 0n;
  const rows = ascending.map((offer, index) => {
    running += BigInt(offer.principal.minorUnits);
    return {
      offerId: offer.id,
      annualPercentageRateBasisPoints: offer.annualPercentageRateBasisPoints,
      principalMinorUnits: BigInt(offer.principal.minorUnits),
      cumulativeMinorUnits: running,
      cumulativeShare: 0,
      isBest: index === 0,
    };
  });

  const deepest = running;
  if (deepest === 0n) {
    return rows;
  }

  /* The only place a ratio becomes a float, and it is a bar width rather than
     an amount. Every figure a person reads stayed bigint the whole way. */
  return rows.map((row) => ({
    ...row,
    cumulativeShare: Number((row.cumulativeMinorUnits * 10_000n) / deepest) / 10_000,
  }));
}
