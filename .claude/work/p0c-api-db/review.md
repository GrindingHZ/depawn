# p0c-api-db review (re-review after fix e6defa8)

## Blocking

None. The prior blocking finding is resolved. apps/api/test/ledger-assertions.ts:12 now casts
the sum to `::bigint`, so Postgres returns int8 and Prisma deserialises it as a native bigint,
matching the declared row type and making `toBe(0n)` a valid comparison. The harness spec
(apps/api/test/harness.integration.spec.ts:45) is no longer vacuous: it seeds two accounts and a
balanced two-entry transaction (2500 debit, 2500 credit in AUD), asserts toSumToZero passes
against real rows, then inserts a one-unit unbalanced credit and asserts the matcher rejects.
Both directions of the matcher are now proven. As a bonus, the fixed clock is now seeded with a
constant instant (1_767_225_600_000n, which is 2026-01-01T00:00:00Z, verified), resolving the
prior non-blocking determinism note.

Verified locally: `pnpm check` exits 0 (typecheck, lint, prettier, boundaries, prose, tokens)
and `pnpm test:unit` passes 18/18. The implementer reports the integration suite passes 6/6
against Testcontainers; the diff is consistent with that claim.

## Non-blocking

- apps/api/src/modules/shared/http/api-exception.filter.ts:7: codeByStatus maps only 401, 403,
  and 404, so a plain HttpException with status 400, 409, 422, or 429 gets code FAULT, which
  docs/04-api-contract.md reserves for 500. Harmless until Zod validation and rate limiting
  arrive; extend the map or route those statuses through DomainErrorHttpException then.
- apps/api/prisma/schema.prisma:59: the account model has no version column. docs/09 says mutable
  aggregates carry version for optimistic concurrency. Fine to defer to the accounts slice, since
  migrations are append-only, but it should not be forgotten there.

## Verdict

APPROVED
