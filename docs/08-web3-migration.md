# 08: Web3 migration

Read this in Phase 0, not Phase 9. Its purpose is to tell you which Phase 1 decisions are load-bearing
for the pivot, so you do not accidentally undo them.

## What does not change

- `apps/api/src/domain/**`: entities, state machines, policies, events
- The API contract in `packages/contracts`: same paths, same shapes, same error codes
- Every screen in all three applications, structurally
- The Playwright suites, apart from wallet authentication setup
- The ledger, which becomes the internal mirror of chain activity and the basis of reconciliation

## What changes

- Four adapters: settlement, custody, identity, event publishing
- The addition of an indexer
- Mutation hooks in the marketplace app gain a sign-and-submit step
- Session auth in the marketplace app is replaced by wallet auth

That is the whole list. If your Phase 9 audit turns up a fifth thing, the seam leaked somewhere and
you should fix the leak rather than widen the list.

## The mapping

| Phase 1 | Phase 3 |
|---|---|
| `AccountId` | Sui address |
| `USER_AVAILABLE` ledger account | `Coin<USDC>` objects in the wallet |
| `USER_HELD` ledger account | `Balance<USDC>` inside the `Offer` dynamic field |
| `custody_receipt` row | `VaultReceipt` object, `key + store` |
| `listing` row + offer rows | Shared `Listing` object with offers as dynamic object fields |
| `loan` row | Shared `Loan` object holding the receipt |
| `lender_note` row | `LenderNote` object, `key + store` |
| `LedgerTransaction.id` | Transaction digest |
| `SettlementRef { kind: 'ledger' }` | `SettlementRef { kind: 'chain' }` |
| `unitOfWork.run()` | One programmable transaction block |
| Outbox event | Move `event::emit` picked up by the indexer |
| `ClockPort.now()` | `&Clock` at `0x6` passed as an argument |
| `ProtocolParameters` object | Shared `Config` object, mutated via `AdminCap` |
| Role guard on `VAULT_STAFF` | `CustodianCap` object held by the vault's key |
| `SELECT ... FOR UPDATE` | Shared-object consensus ordering |

## The Move package

```
packages/move/sources/
  config.move         AdminCap, ProtocolParameters, pause flags
  custody.move        VaultReceipt, CustodianCap, issue and burn
  listing.move        Listing, Offer as dynamic object fields
  loan.move           Loan, origination, accrual, repayment, default
  notes.move          LenderNote, BorrowerNote
  liquidation.move    Auction and waterfall
```

One package, several modules, so modules can use `public(package)` and upgrade together.

Key type decisions, each of which has a Phase 1 counterpart already in place:

- `Escrow`-style objects hold `Balance<T>`, not `Coin<T>`. `Coin` is the wallet-facing wrapper;
  `Balance` is the internal representation. Convert at the boundary.
- `Loan` is shared. Two independent parties must both act on it, so address ownership is impossible.
- `VaultReceipt` has `store` so it can move into a `Listing` and then into a `Loan`. `Loan` has `key`
  but **not** `store`, so nobody outside the package can wrap or transfer it.
- A shared object taken by value must be deleted in that function. Settlement functions destructure
  and delete; nothing else takes a shared object by value.
- Interest arithmetic casts to `u128` for the intermediate product. `principal * rate * elapsed_ms`
  overflows `u64` within days at realistic values. Your TypeScript already uses `bigint` for exactly
  this reason, and the shared fixtures will catch a mismatch.

## Authorisation translates to capabilities

Phase 1 checks `request.user.role === 'VAULT_STAFF'`. Phase 3 has no `msg.sender` role registry; it
has objects.

```move
public fun issue_receipt(_: &CustodianCap, vault_id: ID, ...) { ... }
```

A function that takes `&CustodianCap` is callable only by whoever holds that object. The check is
free: you cannot produce a reference to an object you do not own.

This is why the role guard in Phase 1 should be a single decorator applied at the use case boundary
rather than scattered `if` checks. One guard becomes one capability parameter.

## The pull-not-push refund, revisited

Rule M8 exists because of a Phase 3 gas limit, and it is the clearest example of why you encode Phase
3 constraints in Phase 1.

Accepting an offer on a listing with two hundred offers cannot loop and refund all of them; the
transaction would exceed gas limits and fail. So losing offers become `SUPERSEDED` and lenders reclaim
their own funds.

If Phase 1 refunded eagerly, the Phase 3 behaviour change would be visible to users: money that used
to come back automatically now requires a click. Building it as pull from day one means the pivot
changes nothing a user can perceive.

Apply the same reasoning wherever you are tempted to iterate over an unbounded collection inside a
single operation. If it cannot be a bounded on-chain transaction, do not build it as an unbounded
database transaction.

## The indexer

The one genuinely new subsystem.

Its job is to turn chain events into the read models the API already serves. Three properties, all
mandatory:

1. **Durable cursor.** Restart resumes, never replays from zero.
2. **Idempotent handlers.** Insert the event id in the same database transaction as the state change
   and let a unique constraint short-circuit duplicates.
3. **Pure projection.** State is a function of the event stream. The replay test in
   `docs/06-testing.md` proves it.

Two designs, in order of when to adopt them:

- **Start:** poll GraphQL RPC for events of your package's types, ordered, with a stored cursor.
- **Scale:** stream checkpoints over gRPC and filter for your package, processing each checkpoint
  atomically with its sequence number as the cursor.

A detail that surprises teams: gRPC on Sui exposes checkpoint streaming, not per-event subscription.
"gRPC has streaming" does not mean "gRPC has the stream you want". Plan for client-side filtering.

## Data access, as of 2026

Sui's JSON-RPC is deprecated. Sui Foundation disabled it on mainnet full nodes in late July 2026, with
full decommission planned for mid-October 2026. The replacements are gRPC on full nodes and GraphQL
RPC over the general-purpose indexer.

Practical guidance: gRPC for the backend, submissions, and streaming; GraphQL for flexible queries and
anything the frontend needs. Most teams use both.

```ts
import { SuiGrpcClient } from '@mysten/sui/grpc';
import { SuiGraphQLClient } from '@mysten/sui/graphql';
```

Two consequences for this project:

- Any Sui tutorial or example written before mid-2026 will use `SuiClient` over JSON-RPC. Translate
  it; do not copy it.
- Failure is returned, not thrown. Every submission checks `result.$kind === 'FailedTransaction'`
  before treating the transaction as successful. A submitted transaction can still abort on chain.

## Transaction building

Transaction builders are **pure functions** in `infrastructure/chain/ptb/`. No database, no network,
no injected services. Input in, `Transaction` out.

```ts
export function buildAcceptOfferTransaction(input: AcceptOfferInput): Transaction;
```

This makes them unit-testable without a node, and it means the same builder serves both the
server-side automation path and the client-side signing path.

## Who signs what

| Action | Signer |
|---|---|
| Place an offer, accept, repay, claim | The user's wallet |
| Issue or burn a custody receipt | The vault's `CustodianCap` key, held by the backend |
| Update protocol parameters, pause | An `AdminCap` in a multisig |
| Schedule and close a liquidation | Operations key |

The backend holds keys only for roles it genuinely performs. It never signs on behalf of a user. The
custodian key can mint claims against physical property, so it belongs in a KMS, not an environment
variable, and its use is audit-logged in the same table as everything else.

## Cutover strategy

Do not switch drivers and hope.

1. **Shadow.** Chain adapter is authoritative; ledger adapter also records every movement. A job
   diffs the two continuously and alerts on any divergence. Run until diffs are zero for a sustained
   period.
2. **Testnet, full lifecycle.** Every flow from `docs/10-flows.md` executed end to end, with every
   settlement reference resolving on an explorer.
3. **Capped mainnet pilot.** A hard exposure limit in `Config`, one vault, one item category.
4. **Lift the cap** only after the reconciliation report has been clean for a full liquidation cycle.

Keep the ledger driver working the entire time. The ability to fall back is worth the maintenance.

## Things that will bite

- **Object version conflicts.** Two transactions from the same sender using the same version of an
  owned object cause equivocation, locking the object until the epoch ends. Never let two concurrent
  requests build transactions against the same gas coin. Give each backend signer a small pool of gas
  coins and serialise its submissions through a queue.
- **Shared object contention.** Independent listings are fine. One global registry object in every
  transaction path is a serialisation bottleneck. Many small shared objects, never one big one.
- **Gas is not `msg.value`.** The gas coin and the payment coin are separate concerns.
- **Indexer lag.** There is a real gap between a confirmed transaction and your projection updating.
  The `PENDING_CONFIRMATION` UI state exists for this. Design it in Phase 1.
- **Upgrades.** Keep the `UpgradeCap` in a multisig. Do not make the package immutable on day one; you
  will have bugs.
- **Pause must never trap.** Pausing blocks entrances: new listings, offers, originations. It must
  never block repayment, redemption, reclaim, or default claim. A pause that traps collateral is
  itself an attack surface.
