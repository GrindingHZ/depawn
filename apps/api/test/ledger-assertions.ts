import { expect } from 'vitest';
import type { PrismaService } from '../src/infrastructure/persistence/prisma.service';

/* The one number that must never be wrong: per currency, credits minus debits
   across the whole ledger sum to zero. Every integration test that moves
   money ends with this. */
export function expectLedgerBalances(prisma: PrismaService): { toSumToZero(): Promise<void> } {
  return {
    async toSumToZero(): Promise<void> {
      const rows = await prisma.$queryRaw<{ currency: string; balance: bigint }[]>`
        SELECT currency,
               COALESCE(SUM(CASE WHEN direction = 'CREDIT' THEN minor_units ELSE -minor_units END), 0) AS balance
        FROM ledger_entry
        GROUP BY currency
      `;
      for (const row of rows) {
        expect(row.balance, `ledger sum for ${row.currency}`).toBe(0n);
      }
    },
  };
}
