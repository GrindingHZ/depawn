import { z } from 'zod';
import { moneySchema } from './money';

export const driftKindSchema = z.enum([
  'MISSING_FROM_COUNT',
  'MISSING_FROM_RECORDS',
  'LEDGER_TRANSACTION_IMBALANCE',
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

/* The latest run, or null before anyone has counted anything. Not a list,
   so the cursor rule for list endpoints does not apply. */
export const latestReconciliationResponseSchema = z.object({
  run: reconciliationRunResponseSchema.nullable(),
});

export type LatestReconciliationResponse = z.infer<typeof latestReconciliationResponseSchema>;

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

export const deadLetterRowSchema = z.object({
  id: z.string(),
  type: z.string(),
  attempts: z.number().int(),
  lastError: z.string(),
  deadLetteredAt: z.string(),
});

export const deadLettersResponseSchema = z.object({
  items: z.array(deadLetterRowSchema),
});

export type DeadLetterRowResponse = z.infer<typeof deadLetterRowSchema>;
export type DeadLettersResponse = z.infer<typeof deadLettersResponseSchema>;

export const requestMetricRowSchema = z.object({
  route: z.string(),
  count: z.number().int(),
  errorCount: z.number().int(),
  totalDurationMs: z.number().int(),
  maxDurationMs: z.number().int(),
  averageDurationMs: z.number().int(),
});

export const requestMetricsResponseSchema = z.object({
  routes: z.array(requestMetricRowSchema),
});

export type RequestMetricRowResponse = z.infer<typeof requestMetricRowSchema>;
export type RequestMetricsResponse = z.infer<typeof requestMetricsResponseSchema>;
