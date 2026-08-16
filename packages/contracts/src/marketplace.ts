import { z } from 'zod';
import { itemCategorySchema } from './custody';
import { moneySchema, positiveMoneySchema } from './money';

export const listingStatusSchema = z.enum(['DRAFT', 'ACTIVE', 'MATCHED', 'CANCELLED', 'EXPIRED']);

export const offerStatusSchema = z.enum([
  'PENDING',
  'ACCEPTED',
  'WITHDRAWN',
  'EXPIRED',
  'SUPERSEDED',
]);

export const createListingRequestSchema = z.object({
  receiptId: z.string().min(1),
  requestedPrincipal: positiveMoneySchema,
  maxAnnualPercentageRateBasisPoints: z.number().int().min(1).max(10_000),
  requestedDurationMs: z.number().int().positive(),
  expiresAt: z.iso.datetime(),
});

export type CreateListingRequest = z.infer<typeof createListingRequestSchema>;

export const listingResponseSchema = z.object({
  id: z.string(),
  borrowerAccountId: z.string(),
  receiptId: z.string(),
  requestedPrincipal: moneySchema,
  maxAnnualPercentageRateBasisPoints: z.number().int(),
  requestedDurationMs: z.number().int(),
  expiresAt: z.string(),
  status: listingStatusSchema,
});

export type ListingResponse = z.infer<typeof listingResponseSchema>;

export const offerResponseSchema = z.object({
  id: z.string(),
  listingId: z.string(),
  lenderAccountId: z.string(),
  principal: moneySchema,
  annualPercentageRateBasisPoints: z.number().int(),
  durationMs: z.number().int(),
  expiresAt: z.string(),
  createdAt: z.string(),
  status: offerStatusSchema,
});

export type OfferResponse = z.infer<typeof offerResponseSchema>;

export const rankedOfferResponseSchema = offerResponseSchema.extend({
  totalCostToBorrower: moneySchema,
});

export type RankedOfferResponse = z.infer<typeof rankedOfferResponseSchema>;

export const listingSummarySchema = listingResponseSchema.extend({
  appraisedValue: moneySchema,
  itemCategory: itemCategorySchema,
  /* What the lender is actually lending against. Until P8b a listing carried
     a value and a category and no way to know what the thing was. */
  itemDescription: z.string(),
  /* Whether a photograph exists to fetch from
     `/receipts/{receiptId}/photo`. The bytes are behind their own
     authorisation, so this only says whether asking is worthwhile. */
  hasPhotograph: z.boolean(),
  /* The loan the borrower is asking for, as a share of the appraisal, in
     basis points. Computed here because it is the first thing a lender wants
     and the last thing they should have to work out. */
  loanToValueBasisPoints: z.number().int().nonnegative(),
});

export type ListingSummary = z.infer<typeof listingSummarySchema>;

export const listingDetailResponseSchema = listingSummarySchema.extend({
  maxPrincipal: moneySchema,
  offerBook: z.array(rankedOfferResponseSchema),
});

export type ListingDetailResponse = z.infer<typeof listingDetailResponseSchema>;

export const listingsPageResponseSchema = z.object({
  items: z.array(listingSummarySchema),
  nextCursor: z.string().nullable(),
});

export type ListingsPageResponse = z.infer<typeof listingsPageResponseSchema>;

export const myListingsResponseSchema = z.object({
  items: z.array(listingResponseSchema),
});

export type MyListingsResponse = z.infer<typeof myListingsResponseSchema>;

export const placeOfferRequestSchema = z.object({
  principal: positiveMoneySchema,
  annualPercentageRateBasisPoints: z.number().int().min(1).max(10_000),
  durationMs: z.number().int().positive(),
  expiresAt: z.iso.datetime(),
});

export type PlaceOfferRequest = z.infer<typeof placeOfferRequestSchema>;

export const myOffersResponseSchema = z.object({
  items: z.array(offerResponseSchema),
});

export type MyOffersResponse = z.infer<typeof myOffersResponseSchema>;
