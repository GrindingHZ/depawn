# 01: Architecture

## The shape

Four layers with a strict one-way dependency rule.

```
   HTTP / CLI / Jobs          apps/api/src/modules/*/http
            │
            ▼
      Application             apps/api/src/modules/*/application
      (use cases)                  depends on domain + ports only
            │
            ▼
        Domain                apps/api/src/domain
   (entities, policies,           depends on nothing
    ports as interfaces)
            ▲
            │  implements
     Infrastructure           apps/api/src/infrastructure
   (Prisma, Sui, email,           depends on domain
    clock, id generation)
```

Read the arrows literally. Domain imports nothing from the other three layers. Infrastructure imports
domain in order to implement its interfaces. Application orchestrates. HTTP translates.

Enforce this mechanically with `eslint-plugin-boundaries` or `dependency-cruiser` in CI. An
architecture that is only documented is not enforced.

## Why this shape, given the Web3 pivot

The pivot is not "rewrite the backend in Sui". It is "swap four adapters".

In Phase 1 a loan origination writes rows and ledger entries in Postgres. In Phase 3 it builds a
programmable transaction block, submits it, and waits for the digest. The **use case is the same**:
validate the listing, validate the offer, check the loan-to-value cap, move value, issue notes, emit
events. Only the thing that performs the movement changes.

That is only true if the use case never knew how movement worked. Hence ports.

## The ports

These live in `apps/api/src/domain/ports/`. They are the entire Web2/Web3 seam. There are six.

### SettlementPort

Moves value. The `hold` / `release` / `refund` triple exists because an offer commits funds before
anyone knows whether it will win, and that is exactly what an escrowed `Balance` does on chain.

```ts
export interface SettlementPort {
  hold(command: HoldFundsCommand, unitOfWork: UnitOfWorkContext): Promise<FundsHold>;
  releaseHold(hold: FundsHold, distribution: Distribution[], unitOfWork: UnitOfWorkContext): Promise<SettlementRef>;
  refundHold(hold: FundsHold, unitOfWork: UnitOfWorkContext): Promise<SettlementRef>;
  transfer(command: TransferCommand, unitOfWork: UnitOfWorkContext): Promise<SettlementRef>;
  availableBalance(accountId: AccountId, currency: Currency): Promise<Money>;
}

export interface SettlementRef {
  kind: 'ledger' | 'chain';
  reference: string;
  settledAt: Instant;
}
```

`SettlementRef` is the single most important type in the codebase. In Phase 1 `reference` is a ledger
transaction id. In Phase 3 it is a Sui transaction digest. It is stored on every entity that resulted
from a value movement, it is returned in API responses, and the UI renders it as a receipt line. When
the chain arrives, the UI starts rendering an explorer link and nothing else changes.

`Distribution[]` is the waterfall: an ordered list of `{ accountId, amount }`. Passing the whole
distribution to `releaseHold` in one call is deliberate: it forces the entire payout to be one
atomic settlement, which is what a PTB will be.

### CustodyPort

The on-chain twin of the item.

```ts
export interface CustodyPort {
  issueReceipt(command: IssueReceiptCommand, unitOfWork: UnitOfWorkContext): Promise<CustodyReceipt>;
  transferReceipt(receiptId: ReceiptId, toHolder: AccountId, unitOfWork: UnitOfWorkContext): Promise<SettlementRef>;
  encumberReceipt(receiptId: ReceiptId, loanId: LoanId, unitOfWork: UnitOfWorkContext): Promise<void>;
  releaseEncumbrance(receiptId: ReceiptId, unitOfWork: UnitOfWorkContext): Promise<void>;
  burnReceipt(receiptId: ReceiptId, reason: BurnReason, unitOfWork: UnitOfWorkContext): Promise<SettlementRef>;
}
```

Phase 1: a `custody_receipt` row with a `holderAccountId` and a status column. Phase 3: a Sui object
with `key, store`, and `transferReceipt` becomes a real transfer.

### IdentityPort

```ts
export interface IdentityPort {
  resolveAccount(subject: AuthenticatedSubject): Promise<Account>;
  verifyControl(accountId: AccountId, proof: ControlProof): Promise<boolean>;
}
```

Phase 1: `subject` is a session user id, `verifyControl` is trivially true. Phase 3: `subject` is a
wallet address and `verifyControl` checks a signed challenge. The redemption flow at the counter
calls `verifyControl` in both phases, which means the vault console's UX does not change shape.

### ClockPort

```ts
export interface ClockPort {
  now(): Instant;
}
```

Never call `new Date()` or `Date.now()` anywhere outside the clock adapter. Every maturity check,
expiry check, and accrual calculation takes time as an argument. This is not only for testability.
Move has no ambient timestamp either; it has `&Clock` passed in as an argument. Writing the domain
this way from day one means the Move translation is mechanical.

### UnitOfWork

```ts
export interface UnitOfWork {
  run<T>(work: (context: UnitOfWorkContext) => Promise<T>): Promise<T>;
}
```

Every use case body runs inside exactly one `unitOfWork.run(...)`. Repositories and ports take the
context so they enlist in the same transaction. In Phase 3 the context carries a `Transaction`
builder instead of a Prisma client, and the "commit" is the chain submission.

### DomainEventPublisher

```ts
export interface DomainEventPublisher {
  publish(events: DomainEvent[], context: UnitOfWorkContext): Promise<void>;
}
```

Phase 1 writes to an outbox table in the same transaction; a worker drains it. Phase 3 events come
*back* from the chain via the indexer, and the outbox becomes the submission queue. Building the
outbox in Phase 1 is what makes the indexer feel like a swap rather than a new subsystem.

## Backend folder layout

```
apps/api/src/
  main.ts
  app.module.ts

  domain/
    shared/
      money.ts                  Money value object, arithmetic
      instant.ts                Instant value object
      identifiers.ts            branded id types
      result.ts                 Result<T, E> for expected failures
      domain-error.ts           base error with a stable code
      domain-event.ts
    ports/
      settlement.port.ts
      custody.port.ts
      identity.port.ts
      clock.port.ts
      unit-of-work.ts
      domain-event-publisher.port.ts
    custody/
      custody-receipt.ts        entity + state machine
      appraisal.ts
      vault.ts
      vault-exposure-policy.ts  pure function
    marketplace/
      listing.ts
      offer.ts
      loan-to-value-policy.ts
      offer-ranking.ts          pure function
    lending/
      loan.ts
      lender-note.ts
      borrower-note.ts
      interest-calculator.ts    pure function
      liquidation-waterfall.ts  pure function
    ledger/
      ledger-account.ts
      ledger-entry.ts

  modules/
    custody/
      application/
        record-intake.use-case.ts
        issue-receipt.use-case.ts
        request-redemption.use-case.ts
        confirm-release.use-case.ts
      http/
        custody.controller.ts
        dto/
      custody.module.ts
    marketplace/
    lending/
    liquidation/
    accounts/
    admin/

  infrastructure/
    persistence/
      prisma.service.ts
      prisma-unit-of-work.ts
      repositories/
        prisma-listing.repository.ts
        ...
      mappers/
        listing.mapper.ts       row <-> entity, both directions, pure
    settlement/
      ledger-settlement.adapter.ts       Phase 1
      sui-settlement.adapter.ts          Phase 3
    custody/
      database-custody.adapter.ts        Phase 1
      sui-custody.adapter.ts             Phase 3
    clock/
      system-clock.adapter.ts
    events/
      outbox-publisher.adapter.ts
      outbox-drain.worker.ts

  config/
    configuration.ts
    protocol-parameters.ts      LTV caps, grace, fees, holding periods
```

`domain/` has no `.module.ts` files and no decorators. It is plain TypeScript. Wiring happens in
`modules/*/*.module.ts` where a provider binds the port token to the adapter chosen by configuration.

```ts
// modules/marketplace/marketplace.module.ts
{
  provide: SETTLEMENT_PORT,
  useClass: config.settlementDriver === 'chain'
    ? SuiSettlementAdapter
    : LedgerSettlementAdapter,
}
```

That ternary is the entire Web3 switch, repeated in a handful of modules. Phase 3 flips one
environment variable.

## Repositories

One repository interface per aggregate, defined in the domain, implemented in infrastructure.

```ts
export interface ListingRepository {
  findById(id: ListingId, context: UnitOfWorkContext): Promise<Listing | null>;
  findByIdForUpdate(id: ListingId, context: UnitOfWorkContext): Promise<Listing | null>;
  save(listing: Listing, context: UnitOfWorkContext): Promise<void>;
  search(criteria: ListingSearchCriteria): Promise<Page<ListingSummary>>;
}
```

`findByIdForUpdate` issues `SELECT ... FOR UPDATE`. Use it in every use case that mutates. Optimistic
concurrency via a `version` column is also required; see `docs/06-testing.md` for the concurrency
tests that prove it works.

`search` returns a read-model type, not the aggregate. Do not hydrate aggregates for list views.

## Read models

Queries that power list and detail pages do not go through repositories or aggregates. They are
dedicated query services returning flat DTOs, ideally from a database view.

```
modules/marketplace/application/queries/
  browse-listings.query.ts
  listing-detail.query.ts
```

This split matters for the pivot: in Phase 3 the write path goes to the chain and the read path goes
to your indexer's Postgres projection. If reads already go through a separate query service, the read
side barely changes.

## Error model

Three categories, and they must not be confused.

| Category | Example | Represented as | HTTP |
|---|---|---|---|
| Expected domain failure | Offer already withdrawn | `Result.failure(new OfferWithdrawn())` | 409 / 422 |
| Invalid input | `principal` is not a positive integer | Zod rejection at the DTO boundary | 400 |
| Fault | Postgres unreachable | Thrown exception | 500 |

Domain failures are **returned, not thrown**. They are part of the function's signature and the
compiler forces the caller to handle them. Faults are thrown and caught by a global filter.

```ts
export type Result<T, E extends DomainError> =
  | { ok: true; value: T }
  | { ok: false; error: E };
```

Every `DomainError` carries a stable `code` string (`OFFER_WITHDRAWN`, `LTV_EXCEEDED`). The API
returns the code, the frontend maps codes to copy, and Playwright asserts on codes. Never assert on
error message text anywhere.

## Configuration and protocol parameters

Business parameters are not constants scattered in code. They live in one typed object, are loaded at
boot, are readable by the admin app, and are versioned in the database with an effective date.

```ts
export interface ProtocolParameters {
  maxLoanToValueBasisPoints: Record<ItemCategory, number>;
  minimumOfferLifetimeMs: number;
  defaultGracePeriodMs: number;
  statutoryHoldingPeriodMs: number;
  originationFeeBasisPoints: number;
  liquidationFeeBasisPoints: number;
  maxAnnualPercentageRateBasisPoints: number;
}
```

Every one of these becomes a field in a Move `Config` shared object in Phase 3. Treating them as data
now avoids a painful extraction later.
