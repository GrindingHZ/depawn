# 03: Ledger and money

## Why a double-entry ledger and not a balance column

A `balance` column on the account table is the wrong answer for three reasons. It has no history, so
you cannot answer "why is this number what it is". It has no atomicity guarantee across two accounts,
so a crash mid-transfer creates or destroys money. And it has no analogue on chain, so the Phase 3
migration has nothing to map onto.

A double-entry ledger fixes all three, and it is the closest Web2 structure to what a blockchain
actually is: an append-only log of balanced value movements, from which balances are derived.

## Schema

```prisma
model LedgerAccount {
  id           String   @id
  ownerType    LedgerAccountOwnerType   // USER | PLATFORM | HOLD
  ownerId      String?
  purpose      LedgerAccountPurpose
  currency     String
  createdAt    DateTime

  entries      LedgerEntry[]

  @@unique([ownerType, ownerId, purpose, currency])
}

model LedgerTransaction {
  id           String   @id
  kind         LedgerTransactionKind
  reference    String                    // the domain id that caused it
  occurredAt   DateTime
  entries      LedgerEntry[]

  @@index([kind, reference])
}

model LedgerEntry {
  id            String   @id
  transactionId String
  accountId     String
  direction     EntryDirection            // DEBIT | CREDIT
  minorUnits    BigInt
  currency      String

  transaction   LedgerTransaction @relation(fields: [transactionId], references: [id])
  account       LedgerAccount     @relation(fields: [accountId], references: [id])

  @@index([accountId, id])
}
```

`minorUnits` is always positive. Direction carries the sign. This avoids an entire family of sign bugs
and makes the balance check trivial.

## Chart of accounts

| Purpose | Owner | Meaning |
|---|---|---|
| `USER_AVAILABLE` | user | Spendable balance |
| `USER_HELD` | user | Committed to an outstanding offer |
| `PLATFORM_FEE_REVENUE` | platform | Origination and liquidation fees |
| `PLATFORM_ROUNDING` | platform | Rounding remainders |
| `PLATFORM_FLOAT` | platform | Counterparty for external deposits and withdrawals |

Two accounts per user per currency. `USER_HELD` is what makes "funded offers" real: placing an offer
moves money from available to held, and the money is genuinely unavailable to the lender until the
offer resolves.

## The balance invariant

```
For every LedgerTransaction: sum(DEBIT.minorUnits) == sum(CREDIT.minorUnits), per currency.
```

Enforced three ways, all of them:

1. A domain-level assertion in `LedgerTransaction.build()` that refuses to construct an unbalanced
   transaction.
2. A Postgres deferred constraint trigger that rejects an unbalanced commit.
3. A property test that generates random transaction shapes and asserts the invariant holds.

Belt, braces, and a second pair of braces. This is the one number in the system that must never be
wrong.

## Balances are derived, never stored

```sql
CREATE VIEW ledger_account_balance AS
SELECT
  account_id,
  currency,
  SUM(CASE WHEN direction = 'CREDIT' THEN minor_units ELSE -minor_units END) AS balance
FROM ledger_entry
GROUP BY account_id, currency;
```

If this becomes slow, add a materialised balance table maintained by trigger and a nightly job that
recomputes it from entries and alerts on drift. Do not remove the derivation; it is the thing that
proves the cache is right.

## Transaction kinds and their entry shapes

Every value movement in the product is one of these. Writing them all out here means the settlement
adapter is a lookup table, not a pile of branching logic.

### `DEPOSIT`

Admin-operated in Phase 1. There is no payment rail.

```
DEBIT   PLATFORM_FLOAT        amount
CREDIT  USER_AVAILABLE        amount
```

### `HOLD_FUNDS`: a lender places an offer

```
DEBIT   USER_AVAILABLE        principal
CREDIT  USER_HELD             principal
```

### `REFUND_HOLD`: offer withdrawn, expired, or superseded and reclaimed

```
DEBIT   USER_HELD             principal
CREDIT  USER_AVAILABLE        principal
```

### `ORIGINATE_LOAN`: the offer wins

```
DEBIT   lender USER_HELD              principal
CREDIT  borrower USER_AVAILABLE       principal - originationFee
CREDIT  PLATFORM_FEE_REVENUE          originationFee
```

One transaction, three entries, balanced. In Phase 3 this becomes one PTB.

### `REPAY_LOAN`

```
DEBIT   borrower USER_AVAILABLE       principal + accruedInterest
CREDIT  noteHolder USER_AVAILABLE     principal + accruedInterest
```

Note the credit goes to the *current note holder*, resolved at repayment time, not to a lender id
stored on the loan.

### `SETTLE_LIQUIDATION`

```
DEBIT   buyer USER_AVAILABLE          proceeds
CREDIT  noteHolder USER_AVAILABLE     min(proceeds, amountOwed)
CREDIT  PLATFORM_FEE_REVENUE          liquidationFee
CREDIT  borrower USER_AVAILABLE       surplus
CREDIT  PLATFORM_ROUNDING             remainder
```

The remainder line exists so the transaction balances exactly when integer division leaves a unit
behind. It is usually zero. It must never be omitted.

### `WITHDRAW`

```
DEBIT   USER_AVAILABLE        amount
CREDIT  PLATFORM_FLOAT        amount
```

## The settlement adapter

The Phase 1 adapter is a direct translation of the table above.

```ts
@Injectable()
export class LedgerSettlementAdapter implements SettlementPort {
  constructor(private readonly clock: ClockPort) {}

  async hold(command: HoldFundsCommand, context: UnitOfWorkContext): Promise<FundsHold> {
    const available = await this.readBalance(command.accountId, command.amount.currency, context);
    if (available.isLessThan(command.amount)) {
      throw new InsufficientFunds(command.accountId, command.amount);
    }

    const transaction = LedgerTransaction.build({
      kind: 'HOLD_FUNDS',
      reference: command.reference,
      occurredAt: this.clock.now(),
      entries: [
        debit(availableAccountOf(command.accountId), command.amount),
        credit(heldAccountOf(command.accountId), command.amount),
      ],
    });

    await this.write(transaction, context);
    return FundsHold.from(transaction);
  }
}
```

The concurrency detail that matters: reading the balance and writing the entry must be serialisable
against the same account. Take a row lock on the `LedgerAccount` row before reading the balance, or
use `SERIALIZABLE` isolation for this path and retry on conflict. Test it; see the concurrency
section of `docs/06-testing.md`.

## How this maps to Phase 3

| Phase 1 | Phase 3 |
|---|---|
| `USER_AVAILABLE` account | The user's `Coin<USDC>` objects in their wallet |
| `USER_HELD` account | `Balance<USDC>` inside the `Offer` dynamic field |
| `HOLD_FUNDS` transaction | `make_offer` moving a `Coin` into the listing |
| `ORIGINATE_LOAN` transaction | `accept_offer` PTB: split fee, transfer principal, mint notes |
| `LedgerTransaction.id` | Sui transaction digest |
| The balance view | The chain |

The `SettlementRef` returned by both adapters is the same type. Every entity that stores one keeps
storing one. The API response shape does not change. The frontend renders `reference` as text in
Phase 1 and as an explorer link in Phase 3.

**The ledger does not disappear in Phase 3.** It becomes the internal accounting mirror of on-chain
activity, fed by the indexer, and it is what reconciliation compares the chain against. Building it
now is not throwaway work.

## Rules for money in code

- Never `number` for an amount. `bigint` minor units plus an explicit currency.
- Never `parseFloat`, never `toFixed`, never a currency library that uses doubles.
- API serialises amounts as `{ "minorUnits": "125000", "currency": "AUD" }` with `minorUnits` as a
  **string**, because JSON numbers cannot hold a `bigint` safely.
- Percentages are basis points as integers. 7.25% is `725`. There are no percentage floats anywhere.
- Every division documents its rounding direction in the function's name or a one-line comment
  explaining *why* that direction, and the remainder goes somewhere explicit.
