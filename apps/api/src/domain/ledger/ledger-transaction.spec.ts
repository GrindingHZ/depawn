import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { ledgerAccountIdOf, ledgerTransactionIdOf } from '../shared/identifiers';
import { Instant } from '../shared/instant';
import { Money, currencyOf } from '../shared/money';
import { credit, debit } from './ledger-entry';
import type { LedgerEntry } from './ledger-entry';
import {
  LedgerTransaction,
  NonPositiveEntryAmountError,
  UnbalancedLedgerTransactionError,
} from './ledger-transaction';

const aud = currencyOf('AUD');
const occurredAt = Instant.fromEpochMilliseconds(1_700_000_000_000n);

function buildWith(entries: readonly LedgerEntry[]): LedgerTransaction {
  return LedgerTransaction.build({
    id: ledgerTransactionIdOf('LT1'),
    kind: 'HOLD_FUNDS',
    reference: 'test',
    occurredAt,
    entries,
  });
}

/* Generates a random split of random amounts across debit and credit sides
   that sums equally, which is exactly the class of shapes build must accept. */
const balancedEntriesArbitrary = fc
  .array(fc.bigInt({ min: 1n, max: 1_000_000_000_000n }), { minLength: 1, maxLength: 8 })
  .map((amounts) => {
    const total = amounts.reduce((sum, amount) => sum + amount, 0n);
    const debits = amounts.map((amount, index) =>
      debit(ledgerAccountIdOf(`DEBIT-${index}`), Money.of(amount, aud)),
    );
    const credits = [credit(ledgerAccountIdOf('CREDIT-0'), Money.of(total, aud))];
    return [...debits, ...credits];
  });

describe('LedgerTransaction.build', () => {
  it('accepts every balanced shape and preserves the balance', () => {
    fc.assert(
      fc.property(balancedEntriesArbitrary, (entries) => {
        const transaction = buildWith(entries);
        const debitsSum = transaction.entries
          .filter((entry) => entry.direction === 'DEBIT')
          .reduce((sum, entry) => sum + entry.amount.minorUnits, 0n);
        const creditsSum = transaction.entries
          .filter((entry) => entry.direction === 'CREDIT')
          .reduce((sum, entry) => sum + entry.amount.minorUnits, 0n);
        expect(debitsSum).toBe(creditsSum);
      }),
    );
  });

  it('rejects every unbalanced shape', () => {
    fc.assert(
      fc.property(
        balancedEntriesArbitrary,
        fc.bigInt({ min: 1n, max: 1_000_000n }),
        (entries, extra) => {
          const unbalanced = [...entries, credit(ledgerAccountIdOf('EXTRA'), Money.of(extra, aud))];
          expect(() => buildWith(unbalanced)).toThrow(UnbalancedLedgerTransactionError);
        },
      ),
    );
  });

  it('rejects a zero or negative entry amount', () => {
    expect(() =>
      buildWith([
        debit(ledgerAccountIdOf('A'), Money.of(0n, aud)),
        credit(ledgerAccountIdOf('B'), Money.of(0n, aud)),
      ]),
    ).toThrow(NonPositiveEntryAmountError);
    expect(() =>
      buildWith([
        debit(ledgerAccountIdOf('A'), Money.of(-100n, aud)),
        credit(ledgerAccountIdOf('B'), Money.of(-100n, aud)),
      ]),
    ).toThrow(NonPositiveEntryAmountError);
  });

  it('rejects fewer than two entries', () => {
    expect(() => buildWith([debit(ledgerAccountIdOf('A'), Money.of(100n, aud))])).toThrow(
      UnbalancedLedgerTransactionError,
    );
  });

  it('balances per currency, not across currencies', () => {
    const usd = currencyOf('USD');
    expect(() =>
      buildWith([
        debit(ledgerAccountIdOf('A'), Money.of(100n, aud)),
        credit(ledgerAccountIdOf('B'), Money.of(100n, usd)),
      ]),
    ).toThrow(UnbalancedLedgerTransactionError);
  });
});
