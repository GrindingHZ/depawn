import { z } from 'zod';
import { itemCategorySchema } from './custody';
import { moneySchema } from './money';

/* The market strip and the activity tape. Both are read only views over data
   the marketplace already holds, so nothing here has a write counterpart. */

export const categoryIndexEntrySchema = z.object({
  category: itemCategorySchema,
  liveListings: z.number().int().nonnegative(),
  /* Null when nothing in the category has been offered on. Not zero: a
     category nobody has bid in is not a category lending at nothing. */
  averageRateBasisPoints: z.number().int().nullable(),
  previousAverageRateBasisPoints: z.number().int().nullable(),
});

export type CategoryIndexEntry = z.infer<typeof categoryIndexEntrySchema>;

export const marketIndexResponseSchema = z.object({
  categories: z.array(categoryIndexEntrySchema),
  windowMs: z.number().int().positive(),
});

export type MarketIndexResponse = z.infer<typeof marketIndexResponseSchema>;

export const tapeEventKindSchema = z.enum(['OFFER_PLACED', 'LOAN_ORIGINATED']);

export type TapeEventKind = z.infer<typeof tapeEventKindSchema>;

export const tapeEventSchema = z.object({
  at: z.string(),
  kind: tapeEventKindSchema,
  listingId: z.string(),
  itemDescription: z.string(),
  itemCategory: itemCategorySchema,
  rateBasisPoints: z.number().int(),
  amount: moneySchema,
});

export type TapeEvent = z.infer<typeof tapeEventSchema>;

export const marketTapeResponseSchema = z.object({
  events: z.array(tapeEventSchema),
});

export type MarketTapeResponse = z.infer<typeof marketTapeResponseSchema>;
