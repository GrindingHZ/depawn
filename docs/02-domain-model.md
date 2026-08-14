# 02 — Domain Model

## Value objects

### Money

```ts
export class Money {
  private constructor(
    readonly minorUnits: bigint,
    readonly currency: Currency,
  ) {}

  static of(minorUnits: bigint, currency: Currency): Money;
  static zero(currency: Currency): Money;

  plus(other: Money): Money;
  minus(other: Money): Money;
  multiplyByBasisPoints(basisPoints: number): Money;
  isGreaterThan(other: Money): boolean;
  isZero(): boolean;
}
```

Rules: operations across different currencies throw. `minorUnits` is `bigint`. There is no
`toNumber()`. Formatting for display happens in the frontend from `{ minorUnits: string, currency }`.

### Instant

A wrapper over epoch milliseconds as `bigint`. Exists so that time arithmetic is explicit and so the
Move translation is direct — Sui's `Clock` gives you `timestamp_ms`.

```ts
export class Instant {
  static fromEpochMilliseconds(value: bigint): Instant;
  plusMilliseconds(value: bigint): Instant;
  isAfter(other: Instant): boolean;
  readonly epochMilliseconds: bigint;
}
```

### Branded identifiers

```ts
export type ListingId = Brand<string, 'ListingId'>;
export type OfferId = Brand<string, 'OfferId'>;
export type LoanId = Brand<string, 'LoanId'>;
export type ReceiptId = Brand<string, 'ReceiptId'>;
export type AccountId = Brand<string, 'AccountId'>;
```

Branding is what stops `loanId` being passed where `listingId` is expected. Use ULIDs so ids sort by
creation time and are safe to expose.

## Aggregates

An aggregate is a consistency boundary: everything inside it changes in one transaction, and nothing
outside it is modified in the same operation except through a port.

| Aggregate | Root | Contains |
|---|---|---|
| Custody receipt | `CustodyReceipt` | Appraisal snapshot, encumbrance |
| Listing | `Listing` | Offers |
| Loan | `Loan` | Lender note, borrower note, repayment record |
| Liquidation | `Liquidation` | Bids, waterfall result |
| Ledger transaction | `LedgerTransaction` | Entries |

Offers live inside the listing aggregate. That is deliberate: accepting an offer must atomically read
every other offer's state, and it mirrors the Phase 3 design where offers are dynamic object fields
on the shared `Listing` object.

## Entities and state machines

Every state machine is expressed as an explicit transition table plus a guard method, not as
scattered `if` statements. The table is the thing you unit test exhaustively, and it is the thing that
becomes an `assert!(state == EXPECTED)` in Move.

```ts
const allowedTransitions: Record<ListingStatus, ListingStatus[]> = {
  DRAFT: ['ACTIVE', 'CANCELLED'],
  ACTIVE: ['MATCHED', 'CANCELLED', 'EXPIRED'],
  MATCHED: [],
  CANCELLED: [],
  EXPIRED: [],
};
```

### CustodyReceipt

```
IN_VAULT ──encumber──▶ ENCUMBERED ──release──▶ IN_VAULT
    │                       │
    │                       └──claimDefault──▶ ENCUMBERED (holder changes)
    │
    ├──burnForRedemption──▶ RELEASED
    └──burnForLiquidation─▶ LIQUIDATED
```

Fields: `id`, `vaultId`, `holderAccountId`, `intakeRecordHash`, `appraisedValue: Money`,
`appraisedAt`, `appraiserId`, `itemCategory`, `insurancePolicyReference`, `status`, `encumberedByLoanId`.

Invariants:
- `ENCUMBERED` requires `encumberedByLoanId` to be set. Every other state requires it to be null.
- `RELEASED` and `LIQUIDATED` are terminal. No transition leaves them.
- `holderAccountId` may only change while `ENCUMBERED` via default claim, or while `IN_VAULT` via
  explicit transfer.

The intake record itself is **not** in this aggregate. It is a separate immutable row plus files in
object storage. The receipt holds only its hash. This is what lets Phase 3 put the hash on chain and
leave the evidence off it.

### Listing

```
DRAFT ──publish──▶ ACTIVE ──acceptOffer──▶ MATCHED
                     │
                     ├──cancel──▶ CANCELLED
                     └──expire──▶ EXPIRED
```

Fields: `id`, `borrowerAccountId`, `receiptId`, `requestedPrincipal: Money`,
`maxAnnualPercentageRateBasisPoints`, `requestedDurationMs`, `expiresAt`, `status`, `version`.

Behaviour on the root:

```ts
class Listing {
  publish(now: Instant): Result<void, ListingNotDraft>;
  addOffer(offer: Offer, parameters: ProtocolParameters, now: Instant): Result<void, OfferRejected>;
  withdrawOffer(offerId: OfferId, requestedBy: AccountId, now: Instant): Result<Offer, OfferWithdrawalRejected>;
  acceptOffer(offerId: OfferId, requestedBy: AccountId, now: Instant): Result<AcceptedOffer, OfferAcceptanceRejected>;
  cancel(requestedBy: AccountId): Result<void, ListingCancellationRejected>;
}
```

Note what these methods do **not** do: they do not move money, do not touch the database, and do not
call ports. `acceptOffer` returns an `AcceptedOffer` describing what should happen; the use case then
performs the settlement. Keeping the aggregate pure is what makes it unit-testable without any
infrastructure and what makes the logic portable to Move.

### Offer

```
PENDING ──accept──▶ ACCEPTED
   │
   ├──withdraw──▶ WITHDRAWN
   ├──expire────▶ EXPIRED
   └──supersede─▶ SUPERSEDED   (listing matched with a different offer)
```

Fields: `id`, `listingId`, `lenderAccountId`, `principal: Money`, `annualPercentageRateBasisPoints`,
`durationMs`, `fundsHoldId`, `expiresAt`, `createdAt`, `status`.

**`SUPERSEDED` is not the same as `WITHDRAWN`.** A superseded offer's hold is still live and the
lender must reclaim it. This models rule M8 (pull, not push) and is the state the UI drives a
"Reclaim funds" button from.

Ranking is a pure function, not a database `ORDER BY`, because the rule may become more subtle:

```ts
export function rankOffers(offers: Offer[], listing: Listing): RankedOffer[];
```

Rank primarily by effective total cost to the borrower over the requested duration, then by earliest
submission. Do **not** rank by principal — see rule M4 and the winner's-curse discussion.

### Loan

```
ACTIVE ──repay────▶ REPAID
   │
   └──markDefault──▶ DEFAULTED ──liquidate──▶ LIQUIDATED
                          │
                          └──claimReceipt──▶ DEFAULTED (receipt holder changes)
```

Fields: `id`, `receiptId`, `borrowerAccountId`, `principal: Money`,
`annualPercentageRateBasisPoints`, `startedAt`, `maturesAt`, `graceEndsAt`, `lenderNoteId`,
`borrowerNoteId`, `status`, `originationSettlementRef`, `version`.

The loan does **not** store the lender's account id. It stores the lender note id. Who is owed money
is whoever holds the note. This indirection costs one join now and buys the entire secondary market
later.

```ts
class Loan {
  calculateAmountDue(now: Instant): Money;
  canBeRepaid(now: Instant): boolean;
  canBeDefaulted(now: Instant): boolean;
  canBeLiquidated(now: Instant, parameters: ProtocolParameters): boolean;
  recordRepayment(payment: Money, now: Instant): Result<RepaymentBreakdown, RepaymentRejected>;
  markDefaulted(now: Instant): Result<void, DefaultRejected>;
}
```

### LenderNote and BorrowerNote

```ts
class LenderNote {
  readonly id: LenderNoteId;
  readonly loanId: LoanId;
  holderAccountId: AccountId;
  transferable: boolean;
}
```

Thin by design. `transferable` defaults to `false` behind the `notesTransferable` feature flag —
see the securities-law note in `docs/00-product-overview.md`. Build the transfer endpoint, ship it
disabled.

### Liquidation

```
SCHEDULED ──open──▶ BIDDING ──close──▶ SETTLED
                       │
                       └──cancel──▶ CANCELLED
```

Fields: `id`, `loanId`, `receiptId`, `reservePrice: Money`, `opensAt`, `closesAt`, `winningBidId`,
`status`, `waterfallResult`.

`canBeScheduled` enforces rule L6: `now >= defaultedAt + statutoryHoldingPeriodMs`.

## Pure policy functions

These are functions, not classes. They have no state, take everything they need as arguments, and are
the highest-value unit tests in the codebase because each is a direct pre-image of a Move function.

```ts
// domain/lending/interest-calculator.ts
export function calculateAccruedInterest(
  principal: Money,
  annualPercentageRateBasisPoints: number,
  startedAt: Instant,
  maturesAt: Instant,
  now: Instant,
): Money;

// domain/marketplace/loan-to-value-policy.ts
export function assertWithinLoanToValue(
  principal: Money,
  appraisedValue: Money,
  category: ItemCategory,
  parameters: ProtocolParameters,
): Result<void, LoanToValueExceeded>;

// domain/lending/liquidation-waterfall.ts
export function distributeLiquidationProceeds(
  proceeds: Money,
  amountOwedToLender: Money,
  parameters: ProtocolParameters,
): Distribution[];

// domain/custody/vault-exposure-policy.ts
export function assertWithinInsuredLimit(
  currentExposure: Money,
  additionalValue: Money,
  insuredLimit: Money,
): Result<void, InsuredLimitExceeded>;
```

### Interest, precisely

```ts
export function calculateAccruedInterest(
  principal: Money,
  annualPercentageRateBasisPoints: number,
  startedAt: Instant,
  maturesAt: Instant,
  now: Instant,
): Money {
  const elapsed = clampElapsed(startedAt, maturesAt, now);

  const numerator =
    principal.minorUnits *
    BigInt(annualPercentageRateBasisPoints) *
    elapsed;

  const denominator = 10_000n * MILLISECONDS_PER_YEAR;

  return Money.of(numerator / denominator, principal.currency);
}
```

Three things this must get right, each with its own test:

1. `bigint` throughout. In Move you would cast to `u128` for the intermediate; `principal * rate * elapsed`
   overflows a 64-bit integer for realistic values within days.
2. Elapsed time is clamped at maturity. Interest stops accruing at `maturesAt` (rule L1).
3. Integer division truncates, which rounds in the borrower's favour. That is the intended direction
   and it is documented here so nobody "fixes" it later.

`MILLISECONDS_PER_YEAR` uses 365 days. Fix the convention once, write it down, test it.

## Domain events

```ts
export type DomainEvent =
  | { type: 'ReceiptIssued'; receiptId: ReceiptId; vaultId: VaultId; appraisedValue: Money }
  | { type: 'ListingPublished'; listingId: ListingId; borrowerAccountId: AccountId }
  | { type: 'OfferPlaced'; listingId: ListingId; offerId: OfferId; principal: Money; rateBasisPoints: number }
  | { type: 'OfferWithdrawn'; offerId: OfferId }
  | { type: 'LoanOriginated'; loanId: LoanId; listingId: ListingId; offerId: OfferId; settlementRef: SettlementRef }
  | { type: 'LoanRepaid'; loanId: LoanId; amountPaid: Money; settlementRef: SettlementRef }
  | { type: 'LoanDefaulted'; loanId: LoanId; defaultedAt: Instant }
  | { type: 'ReceiptClaimedByLender'; loanId: LoanId; receiptId: ReceiptId; claimantAccountId: AccountId }
  | { type: 'RedemptionRequested'; receiptId: ReceiptId; requestedBy: AccountId }
  | { type: 'ItemReleased'; receiptId: ReceiptId; releasedBy: StaffId }
  | { type: 'LiquidationSettled'; liquidationId: LiquidationId; proceeds: Money; distributions: Distribution[] };
```

Every event name matches a Move `struct` name you will emit in Phase 3, character for character. This
is not cosmetic — it means the Phase 3 indexer can map `${packageId}::marketplace::LoanOriginated`
straight onto the existing handler.

Events carry ids and amounts, never whole entities. A consumer that needs more reads it.
