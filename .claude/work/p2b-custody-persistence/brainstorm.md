# p2b-custody-persistence brainstorm

## What this slice changes

Custody reaches Postgres: a migration adding `vault`, `intake_record`, `appraisal`, and
`custody_receipt` tables; repository interfaces in the domain with Prisma implementations and
mappers; a `DatabaseCustodyAdapter` implementing `CustodyPort` through the receipt entity's
transition methods; the vault exposure query (sum of live receipt values per vault); the
`CustodyPort` contract suite in `packages/test-support`; and the suite plus repository round trip
tests running against Testcontainers Postgres. Endpoints and UI are p2c and p2d.

## Files touched

New: migration, `domain/custody/*-repository.ts` interfaces,
`infrastructure/persistence/repositories/prisma-{vault,intake-record,appraisal,custody-receipt}.repository.ts`
with mappers, `infrastructure/custody/database-custody.adapter.ts` and `custody.module.ts`,
`packages/test-support/src/custody-port.contract.ts`, integration specs.

Modified: `schema.prisma`, `app.module.ts`, test-support index.

## Approaches

The adapter delegates every transition to the entity methods so the transition table stays the
single authority; a port call that the entity rejects surfaces the domain error. Custody
mutations return a `SettlementRef` per the port signature; Phase 1 has no ledger movement for a
custody transfer, so the reference is a generated ulid naming the custody operation, and the
audit entry with the acting staff member lands in the p2c use cases where the actor is known.
Receipt saves use the same optimistic `updateMany` version check as accounts. Evidence serialises
as a JSON column and serial numbers as a text array; both round trip through the mappers.

## What could break

The exposure query must count `IN_VAULT` and `ENCUMBERED` only (rule C5); the spec covers a
burned receipt dropping out of exposure. The contract suite must leave the Sui adapter room: it
drives only port methods and observes only through the port and the repositories.

## Ambiguity

The `SettlementRef` meaning for Phase 1 custody operations, as above; recorded in the code
comment on the adapter rather than a new open question since Q-010 already covers the reference
semantics gap and Phase 3 replaces these references with digests wholesale.
