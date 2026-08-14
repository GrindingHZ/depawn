import { z } from 'zod';
import { moneySchema } from './money';

export const settlementRefSchema = z.object({
  kind: z.enum(['ledger', 'chain']),
  reference: z.string(),
  settledAt: z.string(),
});

export type SettlementRefDto = z.infer<typeof settlementRefSchema>;

export const ledgerTransactionKindSchema = z.enum([
  'DEPOSIT',
  'HOLD_FUNDS',
  'REFUND_HOLD',
  'ORIGINATE_LOAN',
  'REPAY_LOAN',
  'SETTLE_LIQUIDATION',
  'WITHDRAW',
]);

export const balanceResponseSchema = z.object({
  available: moneySchema,
  held: moneySchema,
});

export type BalanceResponse = z.infer<typeof balanceResponseSchema>;

export const ledgerEntryResponseSchema = z.object({
  id: z.string(),
  kind: ledgerTransactionKindSchema,
  direction: z.enum(['DEBIT', 'CREDIT']),
  purpose: z.enum(['USER_AVAILABLE', 'USER_HELD']),
  amount: moneySchema,
  occurredAt: z.string(),
  reference: z.string(),
});

export type LedgerEntryResponse = z.infer<typeof ledgerEntryResponseSchema>;

export const ledgerEntriesResponseSchema = z.object({
  items: z.array(ledgerEntryResponseSchema),
  nextCursor: z.string().nullable(),
});

export type LedgerEntriesResponse = z.infer<typeof ledgerEntriesResponseSchema>;

export const depositRequestSchema = z.object({
  email: z.email().max(320).optional(),
  amount: moneySchema,
});

export type DepositRequest = z.infer<typeof depositRequestSchema>;

export const withdrawalRequestSchema = z.object({
  amount: moneySchema,
});

export type WithdrawalRequest = z.infer<typeof withdrawalRequestSchema>;

export const settlementResponseSchema = z.object({
  settlementRef: settlementRefSchema,
});

export type SettlementResponse = z.infer<typeof settlementResponseSchema>;
