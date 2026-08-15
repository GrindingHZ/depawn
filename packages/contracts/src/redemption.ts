import { z } from 'zod';

export const redemptionStatusSchema = z.enum(['REQUESTED', 'VERIFIED', 'RELEASED']);

export type RedemptionStatusDto = z.infer<typeof redemptionStatusSchema>;

export const redemptionRequestResponseSchema = z.object({
  id: z.string(),
  receiptId: z.string(),
  vaultId: z.string(),
  requestedByAccountId: z.string(),
  requestedAt: z.string(),
  status: redemptionStatusSchema,
  verifiedAt: z.string().nullable(),
  verifiedByStaffId: z.string().nullable(),
  releasedAt: z.string().nullable(),
  releasedByStaffId: z.string().nullable(),
  sealNumberBroken: z.string().nullable(),
});

export type RedemptionRequestResponse = z.infer<typeof redemptionRequestResponseSchema>;

export const redemptionRequestListResponseSchema = z.object({
  items: z.array(redemptionRequestResponseSchema),
});

export type RedemptionRequestListResponse = z.infer<typeof redemptionRequestListResponseSchema>;

/* The seal is broken in front of the customer, so the number that was broken
   is recorded by the operator rather than read from the receipt. */
export const confirmReleaseRequestSchema = z.object({
  sealNumberBroken: z.string().min(1).max(64),
});

export type ConfirmReleaseRequest = z.infer<typeof confirmReleaseRequestSchema>;
