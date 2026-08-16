import { z } from 'zod';
import { moneySchema } from './money';

export const protocolParametersSchema = z.object({
  maxLoanToValueBasisPointsByCategory: z.record(z.string(), z.number().int().min(0).max(10_000)),
  maxAnnualPercentageRateBasisPoints: z.number().int().min(1).max(10_000),
  minimumOfferLifetimeMs: z.number().int().min(0),
  originationFeeBasisPoints: z.number().int().min(0).max(10_000),
  liquidationFeeBasisPoints: z.number().int().min(0).max(10_000),
  gracePeriodMs: z.number().int().min(0),
  statutoryHoldingPeriodMs: z.number().int().min(0),
  dualAppraisalThreshold: moneySchema,
  notesTransferable: z.boolean(),
});

export type ProtocolParametersDto = z.infer<typeof protocolParametersSchema>;

export const parameterVersionSchema = z.object({
  id: z.string(),
  effectiveAt: z.string(),
  writtenByAccountId: z.string(),
  parameters: protocolParametersSchema,
});

export type ParameterVersionResponse = z.infer<typeof parameterVersionSchema>;

export const protocolParametersResponseSchema = z.object({
  current: protocolParametersSchema,
  history: z.array(parameterVersionSchema),
});

export type ProtocolParametersResponse = z.infer<typeof protocolParametersResponseSchema>;

/* An edit is a new version with the instant it takes effect, never an update
   in place, so what applied on any past day stays answerable. */
export const updateParametersRequestSchema = z.object({
  effectiveAt: z.iso.datetime(),
  parameters: protocolParametersSchema,
});

export type UpdateParametersRequest = z.infer<typeof updateParametersRequestSchema>;
