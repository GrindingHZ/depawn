# p0b-domain-kernel brainstorm

## What this slice changes

Creates the `apps/api` workspace and the domain shared kernel: `Money`, `Instant`, branded
identifiers, `Result`, `DomainError`, `DomainEvent`, and the six ports from
`docs/01-architecture.md` as interfaces. The only implementations are the two clock adapters,
system and fixed, since `docs/07-phase-plan.md` P0 names `ClockPort` as the one implemented port.
Unit tests run under Vitest. ESLint gains the domain purity restrictions from
`docs/09-conventions.md`: no ambient time, randomness, id generation, environment access, or
console in `domain/`.

## Files touched

New: `apps/api/package.json`, `apps/api/tsconfig.json`, `apps/api/vitest.config.ts`, and under
`apps/api/src/domain/`: `shared/money.ts`, `shared/instant.ts`, `shared/identifiers.ts`,
`shared/result.ts`, `shared/domain-error.ts`, `shared/domain-event.ts`, and `ports/` holding
`settlement.port.ts`, `custody.port.ts`, `identity.port.ts`, `clock.port.ts`, `unit-of-work.ts`,
`domain-event-publisher.port.ts`. Adapters: `infrastructure/clock/system-clock.adapter.ts` and
`infrastructure/clock/fixed-clock.adapter.ts`. Specs beside their subjects.

Modified: `eslint.config.mjs` for the purity rules.

## Approaches

Where the fixed clock lives: `packages/test-support` versus `apps/api/src/infrastructure/clock/`.
Chosen: the api infrastructure folder, because the fixed clock is a real `ClockPort` adapter the
test application mounts, importing it needs no cross-workspace source mapping, and
`packages/test-support` earns its existence later with the port contract suites in P1. Types the
ports reference but whose entities belong to later phases (`CustodyReceipt`, `Account`) are
declared as readonly interfaces now and upgraded to entities in their own slices; the alternative,
leaving those ports out of P0, contradicts the phase plan's exit criteria.

## What could break

`scripts/check-design-tokens.sh` scans all TypeScript for hex-like patterns, so identifier test
fixtures must avoid `#` strings. The prose check scans TypeScript comments; keep them plain. The
boundary check activates for real once `apps/api/src` exists, so any accidental domain import of
infrastructure fails `pnpm check` from this slice on.

## Ambiguity

`docs/02-domain-model.md` names `Money.isGreaterThan` but the ledger adapter sketch in
`docs/03-ledger-and-money.md` calls `isLessThan`; both are implemented. Nothing else is
undecidable.
