import type { LedgerTransactionId } from '../shared/identifiers';
import type { Instant } from '../shared/instant';
import type { LedgerEntry } from './ledger-entry';

export type LedgerTransactionKind =
  | 'DEPOSIT'
  | 'HOLD_FUNDS'
  | 'REFUND_HOLD'
  | 'ORIGINATE_LOAN'
  | 'REPAY_LOAN'
  | 'SETTLE_LIQUIDATION'
  | 'WITHDRAW';

export class UnbalancedLedgerTransactionError extends Error {
  constructor(currency: string, debits: bigint, credits: bigint) {
    super(`Debits ${debits} do not equal credits ${credits} for ${currency}`);
    this.name = 'UnbalancedLedgerTransactionError';
  }
}

export class NonPositiveEntryAmountError extends Error {
  constructor() {
    super('Every ledger entry amount must be positive; direction carries the sign');
    this.name = 'NonPositiveEntryAmountError';
  }
}

export interface BuildLedgerTransactionInput {
  readonly id: LedgerTransactionId;
  readonly kind: LedgerTransactionKind;
  readonly reference: string;
  readonly occurredAt: Instant;
  readonly entries: readonly LedgerEntry[];
}

export class LedgerTransaction {
  private constructor(
    readonly id: LedgerTransactionId,
    readonly kind: LedgerTransactionKind,
    readonly reference: string,
    readonly occurredAt: Instant,
    readonly entries: readonly LedgerEntry[],
  ) {}

  /* Refuses to construct an unbalanced transaction. This is the first of the
     three balance enforcement layers; the database trigger and the property
     test are the other two. */
  static build(input: BuildLedgerTransactionInput): LedgerTransaction {
    if (input.entries.length < 2) {
      throw new UnbalancedLedgerTransactionError('any', 0n, 0n);
    }

    const sums = new Map<string, { debits: bigint; credits: bigint }>();
    for (const entry of input.entries) {
      if (entry.amount.minorUnits <= 0n) {
        throw new NonPositiveEntryAmountError();
      }
      const sum = sums.get(entry.amount.currency) ?? { debits: 0n, credits: 0n };
      if (entry.direction === 'DEBIT') {
        sum.debits += entry.amount.minorUnits;
      } else {
        sum.credits += entry.amount.minorUnits;
      }
      sums.set(entry.amount.currency, sum);
    }

    for (const [currency, sum] of sums) {
      if (sum.debits !== sum.credits) {
        throw new UnbalancedLedgerTransactionError(currency, sum.debits, sum.credits);
      }
    }

    return new LedgerTransaction(input.id, input.kind, input.reference, input.occurredAt, [
      ...input.entries,
    ]);
  }
}
