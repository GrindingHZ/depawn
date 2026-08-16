import { z } from 'zod';
import { moneySchema } from './money';

export const driftKindSchema = z.enum([
  'MISSING_FROM_COUNT',
  'MISSING_FROM_RECORDS',
  'LEDGER_ACCOUNT_IMBALANCE',
  'LEDGER_GLOBAL_IMBALANCE',
]);

export type DriftKindDto = z.infer<typeof driftKindSchema>;

export const driftRowSchema = z.object({
  kind: driftKindSchema,
  subject: z.string(),
  field: z.string(),
  expected: z.string(),
  observed: z.string(),
});

export type DriftRowResponse = z.infer<typeof driftRowSchema>;

export const reconciliationRunResponseSchema = z.object({
  id: z.string(),
  vaultId: z.string().nullable(),
  startedAt: z.string(),
  drift: z.array(driftRowSchema),
});

export type ReconciliationRunResponse = z.infer<typeof reconciliationRunResponseSchema>;

export const reconciliationListResponseSchema = z.object({
  items: z.array(reconciliationRunResponseSchema),
});

export type ReconciliationListResponse = z.infer<typeof reconciliationListResponseSchema>;

/* The operator submits what they physically counted; the server holds what
   it believes and reports every disagreement. */
export const reconcileRequestSchema = z.object({
  vaultId: z.string().min(1),
  countedReceiptIds: z.array(z.string().min(1)),
});

export type ReconcileRequest = z.infer<typeof reconcileRequestSchema>;

export const loanBookResponseSchema = z.object({
  outstandingCount: z.number().int(),
  outstandingPrincipal: moneySchema,
  overdueCount: z.number().int(),
  atRiskCount: z.number().int(),
  defaultedCount: z.number().int(),
});

export type LoanBookResponse = z.infer<typeof loanBookResponseSchema>;

export const vaultExposureRowSchema = z.object({
  vaultId: z.string(),
  exposure: moneySchema,
  insuredLimit: moneySchema,
  receiptCount: z.number().int(),
});

export const exposureByVaultResponseSchema = z.object({
  items: z.array(vaultExposureRowSchema),
});

export type ExposureByVaultResponse = z.infer<typeof exposureByVaultResponseSchema>;
