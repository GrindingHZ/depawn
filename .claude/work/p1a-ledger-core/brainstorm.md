# p1a-ledger-core brainstorm

## What this slice changes

The double-entry ledger from `docs/03-ledger-and-money.md`: domain entities (`LedgerAccount`,
`LedgerEntry`, `LedgerTransaction` with the balance assertion in `build`), the Postgres deferred
constraint trigger, a `funds_hold` table, the `LedgerSettlementAdapter` implementing every
`SettlementPort` method, the shared contract suite in `packages/test-support`, a fast-check
property test on transaction balance, and the concurrency proof that two racing holds cannot
overdraw. P1's endpoints and screens follow in `p1b-wallet`.

## Files touched

New: `apps/api/src/domain/ledger/` (entities, `platform-accounts.ts`, `insufficient-funds.ts`),
a migration adding `funds_hold` and the balance trigger,
`apps/api/src/infrastructure/settlement/ledger-settlement.adapter.ts` plus a ledger account
directory, `packages/test-support/` with `settlement-port.contract.ts`, and integration specs.

Modified: `apps/api/prisma/schema.prisma`, module wiring for `SETTLEMENT_PORT`.

## Approaches

Platform recipients in a `Distribution` are ordinary `AccountId` values using sentinel ids
(`PLATFORM_FEE`, `PLATFORM_ROUNDING`, `PLATFORM_FLOAT`) that the directory maps to platform
ledger accounts; the alternative, a purpose field on `Distribution`, would not survive the chain
translation where a distribution is an address plus an amount. Transfer kind is derived from the
participants (float to user is `DEPOSIT`, user to float is `WITHDRAW`, otherwise `REPAY_LOAN`)
because the port signature from docs/01 carries no kind. Exactly-once refund and release are
enforced by a status column on `funds_hold` locked `FOR UPDATE`.

The contract suite imports domain types by deep path (`@depawn/api/src/domain/...`), which the
workspace symlink resolves; duplicating the port type in test-support would drift.

## What could break

The deferred trigger fires per inserted entry at commit; acceptable at demo scale. `hold` and
`transfer` lock the ledger account row before reading the balance, which the concurrency test
proves. The property test generates transaction shapes; the generator must only emit balanced
shapes for `build` to accept, plus a negative case asserting the unbalanced shape throws.

## Ambiguity

`docs/07-phase-plan.md` P1 names property tests on "balance and waterfall", but the waterfall
function is P6 scope; the balance property lands now and the waterfall property lands with the
function. The trigger is added in a new migration since applied migrations are never edited.
