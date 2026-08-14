import type { LedgerAccountId } from '../shared/identifiers';
import type { Money } from '../shared/money';

export type EntryDirection = 'DEBIT' | 'CREDIT';

/* Amounts are always positive; direction carries the sign
   (docs/03-ledger-and-money.md). Entries are value objects inside the
   transaction aggregate; persistence assigns row ids. */
export interface LedgerEntry {
  readonly accountId: LedgerAccountId;
  readonly direction: EntryDirection;
  readonly amount: Money;
}

export function debit(accountId: LedgerAccountId, amount: Money): LedgerEntry {
  return { accountId, direction: 'DEBIT', amount };
}

export function credit(accountId: LedgerAccountId, amount: Money): LedgerEntry {
  return { accountId, direction: 'CREDIT', amount };
}
