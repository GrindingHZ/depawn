import { z } from 'zod';

/* Amounts serialise as strings because JSON numbers cannot hold a bigint
   safely (docs/03-ledger-and-money.md). */
export const moneySchema = z.object({
  minorUnits: z.string().regex(/^-?\d+$/),
  currency: z.string().length(3),
});

export type MoneyDto = z.infer<typeof moneySchema>;

/* Phase 1 is single currency (docs/00-product-overview.md non-goals); the
   model carries currency everywhere so widening later is a schema change. */
export const positiveMoneySchema = z.object({
  minorUnits: z.string().regex(/^[1-9]\d*$/),
  currency: z.literal('AUD'),
});
