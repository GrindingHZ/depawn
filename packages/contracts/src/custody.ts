import { z } from 'zod';
import { moneySchema, positiveMoneySchema } from './money';

export const itemCategorySchema = z.enum(['BULLION', 'WATCH', 'JEWELLERY', 'COLLECTIBLE', 'ART']);

export type ItemCategoryDto = z.infer<typeof itemCategorySchema>;

/* The order a person reads them in, most liquid first, which is also the
   order the loan to value caps run. */
export const itemCategories = itemCategorySchema.options;

export const intakeStatusSchema = z.enum(['DRAFT', 'SEALED']);

export const receiptStatusSchema = z.enum(['IN_VAULT', 'ENCUMBERED', 'RELEASED', 'LIQUIDATED']);

export const evidenceItemSchema = z.object({
  label: z.string().min(1),
  contentHash: z.string().min(1),
  /* Determined from the bytes at upload, not from what the uploader claimed.
     Optional because evidence written before photographs were verified has
     no recorded type. */
  contentType: z.string().min(1).optional(),
  byteLength: z.number().int().nonnegative().optional(),
});

export type EvidenceItemDto = z.infer<typeof evidenceItemSchema>;

export const beginIntakeRequestSchema = z.object({
  borrowerEmail: z.email().max(320),
  itemCategory: itemCategorySchema,
  itemDescription: z.string().min(1).max(2000),
});

export type BeginIntakeRequest = z.infer<typeof beginIntakeRequestSchema>;

export const patchIntakeRequestSchema = z.object({
  itemDescription: z.string().min(1).max(2000).optional(),
  serialNumbers: z.array(z.string().min(1)).max(50).optional(),
  sealNumber: z.string().min(1).max(100).optional(),
});

export type PatchIntakeRequest = z.infer<typeof patchIntakeRequestSchema>;

export const recordAppraisalRequestSchema = z.object({
  value: positiveMoneySchema,
  method: z.string().min(1).max(500),
  comparableReferences: z.string().max(2000),
});

export type RecordAppraisalRequest = z.infer<typeof recordAppraisalRequestSchema>;

export const appraisalResponseSchema = z.object({
  id: z.string(),
  appraiserId: z.string(),
  value: moneySchema,
  method: z.string(),
  comparableReferences: z.string(),
  appraisedAt: z.string(),
});

export type AppraisalResponse = z.infer<typeof appraisalResponseSchema>;

export const intakeResponseSchema = z.object({
  id: z.string(),
  vaultId: z.string(),
  borrowerAccountId: z.string(),
  itemCategory: itemCategorySchema,
  itemDescription: z.string(),
  serialNumbers: z.array(z.string()),
  sealNumber: z.string().nullable(),
  evidence: z.array(evidenceItemSchema),
  status: intakeStatusSchema,
  sealedHash: z.string().nullable(),
  appraisals: z.array(appraisalResponseSchema),
});

export type IntakeResponse = z.infer<typeof intakeResponseSchema>;

export const issueReceiptRequestSchema = z.object({
  insurancePolicyReference: z.string().min(1).max(200),
});

export type IssueReceiptRequest = z.infer<typeof issueReceiptRequestSchema>;

export const receiptResponseSchema = z.object({
  id: z.string(),
  vaultId: z.string(),
  holderAccountId: z.string(),
  intakeRecordHash: z.string(),
  appraisedValue: moneySchema,
  appraisedAt: z.string(),
  itemCategory: itemCategorySchema,
  itemDescription: z.string(),
  /* Whether a photograph can be fetched from
     `/receipts/{id}/photo`. The bytes have their own authorisation; this only
     says whether asking is worthwhile. */
  hasPhotograph: z.boolean(),
  insurancePolicyReference: z.string(),
  status: receiptStatusSchema,
  encumberedByLoanId: z.string().nullable(),
});

export type ReceiptResponse = z.infer<typeof receiptResponseSchema>;

export const receiptListResponseSchema = z.object({
  items: z.array(receiptResponseSchema),
});

export type ReceiptListResponse = z.infer<typeof receiptListResponseSchema>;

export const vaultExposureResponseSchema = z.object({
  vaultId: z.string(),
  insuredLimit: moneySchema,
  exposure: moneySchema,
  remaining: moneySchema,
});

export type VaultExposureResponse = z.infer<typeof vaultExposureResponseSchema>;
