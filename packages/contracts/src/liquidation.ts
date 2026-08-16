import { z } from 'zod';
import { moneySchema, positiveMoneySchema } from './money';

export const liquidationStatusSchema = z.enum(['SCHEDULED', 'BIDDING', 'SETTLED', 'CANCELLED']);

export type LiquidationStatusDto = z.infer<typeof liquidationStatusSchema>;

export const bidResponseSchema = z.object({
  id: z.string(),
  bidderAccountId: z.string(),
  amount: moneySchema,
  placedAt: z.string(),
});

export type BidResponse = z.infer<typeof bidResponseSchema>;

export const liquidationResponseSchema = z.object({
  id: z.string(),
  loanId: z.string(),
  receiptId: z.string(),
  reservePrice: moneySchema,
  status: liquidationStatusSchema,
  opensAt: z.string().nullable(),
  closesAt: z.string().nullable(),
  winningBidId: z.string().nullable(),
  highestBid: moneySchema.nullable(),
  bids: z.array(bidResponseSchema),
});

export type LiquidationResponse = z.infer<typeof liquidationResponseSchema>;

export const liquidationListResponseSchema = z.object({
  items: z.array(liquidationResponseSchema),
});

export type LiquidationListResponse = z.infer<typeof liquidationListResponseSchema>;

export const scheduleLiquidationRequestSchema = z.object({
  reservePrice: positiveMoneySchema,
});

export type ScheduleLiquidationRequest = z.infer<typeof scheduleLiquidationRequestSchema>;

export const openLiquidationRequestSchema = z.object({
  biddingWindowMs: z.number().int().positive(),
});

export type OpenLiquidationRequest = z.infer<typeof openLiquidationRequestSchema>;

export const placeBidRequestSchema = z.object({
  amount: positiveMoneySchema,
});

export type PlaceBidRequest = z.infer<typeof placeBidRequestSchema>;
