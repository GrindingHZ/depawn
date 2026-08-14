# p0c-api-db brainstorm

## What this slice changes

Turns `apps/api` into a bootable NestJS application backed by Postgres. It adds the Docker Compose
Postgres service, the Prisma schema and initial migration for the P0 tables (`account`, `session`,
`ledger_account`, `ledger_transaction`, `ledger_entry`, `outbox_event`, `idempotency_record`,
`audit_log`), the `PrismaService` and `PrismaUnitOfWork` adapter, the global error filter mapping
the three error categories from `docs/01-architecture.md`, request logging with a correlation id,
and the integration test harness: Testcontainers Postgres, `createTestApplication` with the fixed
clock mounted, truncation between tests, and the `toSumToZero` ledger matcher.

## Files touched

New: `docker-compose.yml`, `apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/*`,
`apps/api/src/main.ts`, `apps/api/src/app.module.ts`, `apps/api/src/modules/health/*`,
`apps/api/src/infrastructure/persistence/prisma.service.ts`,
`apps/api/src/infrastructure/persistence/prisma-unit-of-work.ts`,
`apps/api/src/modules/shared/http/domain-error.filter.ts`,
`apps/api/src/modules/shared/http/correlation-id.middleware.ts`,
`apps/api/test/create-test-application.ts`, `apps/api/test/database.ts`,
`apps/api/test/matchers/to-sum-to-zero.ts`, `apps/api/vitest.integration.config.ts`.

Modified: `apps/api/package.json`, `apps/api/tsconfig.json` (decorators), root `turbo.json` if the
integration task needs wiring.

## Approaches

Vitest with NestJS decorators: `unplugin-swc` per `docs/06-testing.md`, chosen as documented; the
alternative (esbuild only) drops `emitDecoratorMetadata` and breaks Nest injection by type.
Separate `vitest.integration.config.ts` keeps `test:unit` fast, as docs/06 requires.
The ledger tables ship in the migration now, but their domain entities and the settlement adapter
are P1 scope; this slice only proves the schema migrates and the harness boots.

## What could break

Docker daemon availability on this Windows host; the daemon was not running at session start and
was launched during stage 1. Testcontainers needs it working before task 7. Prisma engines download
requires an approved build script under pnpm 11; `allowBuilds` must gain `prisma` and
`@prisma/engines`. The design token check scans TypeScript for hex-like strings; migration SQL is
not scanned.

## Ambiguity

`docs/07-phase-plan.md` P0 lists the ledger tables in the initial migration even though the ledger
behaviour is P1; the narrowest reading ships the tables now, exactly as listed, with no ledger code
beyond the schema. The Postgres deferred balance trigger from `docs/03-ledger-and-money.md` is P1
scope, since it belongs with the ledger behaviour and its property tests.
