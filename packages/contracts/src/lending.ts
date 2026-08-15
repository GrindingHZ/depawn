import { z } from 'zod';
import { moneySchema } from './money';
import { settlementRefSchema } from './wallet';

export const loanStatusSchema = z.enum(['ACTIVE', 'REPAID', 'DEFAULTED', 'LIQUIDATED']);

export type LoanStatusDto = z.infer<typeof loanStatusSchema>;

export const loanRoleSchema = z.enum(['borrower', 'lender']);

export type LoanRole = z.infer<typeof loanRoleSchema>;

export const loanResponseSchema = z.object({
  id: z.string(),
  receiptId: z.string(),
  borrowerAccountId: z.string(),
  principal: moneySchema,
  annualPercentageRateBasisPoints: z.number().int(),
  startedAt: z.string(),
  maturesAt: z.string(),
  graceEndsAt: z.string(),
  lenderNoteHolderAccountId: z.string(),
  status: loanStatusSchema,
  originationSettlementRef: settlementRefSchema,
});

export type LoanResponse = z.infer<typeof loanResponseSchema>;

export const myLoansResponseSchema = z.object({
  items: z.array(loanResponseSchema),
});

export type MyLoansResponse = z.infer<typeof myLoansResponseSchema>;
