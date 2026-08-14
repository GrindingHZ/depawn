# p0d-auth brainstorm

## What this slice changes

Accounts and sessions: register, login, logout, and `GET /me` per `docs/04-api-contract.md`, with
argon2id hashing, an HTTP-only SameSite strict session cookie, and a role guard. It also creates
`packages/contracts` with the Zod schemas and the error code table, since the API contract says
every body is defined there once and the frontends in `p0e` import the same types. Supporting
ports arrive with it: `AccountRepository` and `PasswordHasher` in `domain/accounts/`, an
`IdGenerator` in `domain/shared/`, with ULID and argon2 adapters in infrastructure.

## Files touched

New: `packages/contracts/` (package files, `src/error-codes.ts`, `src/auth.ts`, `src/money.ts`
shared shapes), `apps/api/src/domain/accounts/account-repository.ts`,
`apps/api/src/domain/accounts/password-hasher.ts`, `apps/api/src/domain/shared/id-generator.ts`,
`apps/api/src/infrastructure/id/ulid-id-generator.adapter.ts`,
`apps/api/src/infrastructure/security/argon2-password-hasher.adapter.ts`,
`apps/api/src/infrastructure/persistence/repositories/prisma-account.repository.ts`, the
`modules/accounts` tree (use cases, controller, session service, guards, decorators), a migration
adding `version` to `account`, and integration specs.

Modified: `apps/api/src/domain/accounts/account.ts` (entity fields), `app.module.ts`, harness.

## Approaches

Password hashing: `argon2` (node-gyp build) versus `@node-rs/argon2` (prebuilt napi). Chosen:
`@node-rs/argon2`, because it ships prebuilt binaries and avoids a native toolchain on this
Windows host and in CI. Sessions: JWT versus database sessions. Chosen: database sessions with a
hashed token, because `docs/04` specifies a session cookie, logout must revoke server side, and
Phase 3 swaps the login exchange but keeps the session mechanism.

## What could break

The idempotency interceptor is deferred to P1 where the first authenticated write endpoint with
money movement lands; the storage table already exists. The contracts package exposes TypeScript
source directly (`types` pointing at `src`), which typechecks and tests fine; a production build
pipeline may later need project references, accepted until the build slice needs it.

## Ambiguity

`docs/04` lists no error code for schema validation, duplicate registration, or rate limiting.
Narrowest reading: add `VALIDATION_FAILED` and `EMAIL_ALREADY_REGISTERED` to the contracts code
table, since the envelope requires a stable code and inventing them per call site would be worse.
Recorded in `docs/OPEN-QUESTIONS.md` as Q-008.
