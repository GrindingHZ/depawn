import type { EntryDirection } from '../ledger/ledger-entry';
import type { LedgerTransactionKind } from '../ledger/ledger-transaction';
import type { AccountId } from '../shared/identifiers';
import type { Instant } from '../shared/instant';
import type { Currency, Money } from '../shared/money';

/* Read model for the wallet screens. Lives with the ports so the Prisma
   implementation stays in infrastructure without crossing the layer rule;
   in Phase 3 the same interface reads the indexer projection. */
export interface WalletBalance {
  readonly available: Money;
  readonly held: Money;
}

export interface WalletLedgerEntry {
  readonly id: string;
  readonly kind: LedgerTransactionKind;
  readonly direction: EntryDirection;
  readonly purpose: 'USER_AVAILABLE' | 'USER_HELD';
  readonly amount: Money;
  readonly occurredAt: Instant;
  readonly reference: string;
}

export interface WalletEntriesPage {
  readonly items: readonly WalletLedgerEntry[];
  readonly nextCursor: string | null;
}

export interface WalletQueries {
  balanceOf(accountId: AccountId, currency: Currency): Promise<WalletBalance>;
  ledgerEntriesOf(
    accountId: AccountId,
    cursor: string | null,
    limit: number,
  ): Promise<WalletEntriesPage>;
}

export const WALLET_QUERIES = Symbol('WalletQueries');
