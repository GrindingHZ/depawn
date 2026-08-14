# p0d-auth review

Base e140233, head 99a5343, eight commits. Re-review after the blocking fix commit 99a5343
(test(domain): cover account session and auth use case rejections). Verified: pnpm check exit 0,
pnpm test:unit exit 0 with 27/27 green (18 pre-existing plus 9 new), dependency-cruiser reports no
boundary violations, commit message passes the format rules.

## Blocking

None. The prior blocking finding is resolved:

- account.spec.ts covers Account.create (email lowercasing, default MEMBER role, version 0) and
  hasRole/hasAnyRole membership including the negative case.
- session.spec.ts covers Session.isExpired at the boundary: live strictly before and at the expiry
  instant, expired one millisecond after.
- register-account.use-case.spec.ts covers the happy path (MEMBER role, password hashed) and the
  duplicate email rejection, including case-insensitive duplication (A@Example.Test vs
  a@example.test) mapping to EMAIL_ALREADY_REGISTERED.
- login.use-case.spec.ts covers the happy path (session persisted under the token hash, expiry
  exactly one lifetime after a StoppedClock now) and both InvalidCredentials rejections: unknown
  email and wrong password, each mapping to UNAUTHENTICATED.
- test-support/account-fakes.ts supplies in-memory implementations of the ports
  (AccountRepository, SessionRepository, PasswordHasher, SessionTokenIssuer, IdGenerator,
  ClockPort, UnitOfWork). These are fakes of ports, not mocks of owned domain code, and the file
  imports only domain types, so the application specs stay free of infrastructure imports and the
  boundary check stays clean.

## Non-blocking

Carried forward from the prior review, all still open:

- apps/api/src/infrastructure/persistence/repositories/prisma-account.repository.ts:24: the
  email.toLowerCase() in findByEmail puts the case-insensitivity policy inside the Prisma adapter.
  Login with a mixed-case email works only because this adapter normalises; a Sui or in-memory
  AccountRepository that does not would change behaviour. Normalise on the caller side of the port
  (use case or a domain email value) so every adapter sees the canonical form. Note the new
  InMemoryAccountRepository fake reproduces the same adapter-side lowercasing, which makes the
  tests pass but also copies the policy into a second adapter; moving normalisation to the caller
  would let both adapters drop it.
- apps/api/src/modules/accounts/application/register-account.use-case.ts:32: two concurrent
  registrations with the same email can both pass findByEmail; the loser hits the unique
  constraint and surfaces as 500 FAULT instead of 409 EMAIL_ALREADY_REGISTERED. The docs/09
  checklist asks for a concurrency test where two users can act on the same resource.
- apps/api/src/modules/accounts/http/auth.controller.ts:47: the session cookie omits the Secure
  attribute. docs/04 mandates only HttpOnly and SameSite strict, so this passes the contract, but
  it needs Secure (or an environment switch) before anything serves over TLS.
- apps/api/src/infrastructure/persistence/repositories/prisma-account.repository.ts:10:
  StaleAccountVersionError has no HTTP mapping and would surface as 500 FAULT. No account update
  path exists yet, so nothing can hit it; add a 409 mapping when one does.
- Idempotency-Key deferral: docs/04 says every POST accepts the header, but no money-moving
  endpoint exists, the idempotency_record table already exists from the spine, and register replay
  degrades safely to a 409. Deferring the interceptor to P1 is a reasonable narrowest reading. The
  decision lives only in .claude/work/p0d-auth/brainstorm.md; docs/OPEN-QUESTIONS.md or the P1
  plan should carry it so it survives the work directory.
- packages/test-support does not exist, so AccountRepository and SessionRepository have no shared
  port contract suite (definition of done item 2). docs/07 attaches contract suites to
  SettlementPort at P1 and CustodyPort at P2, so this is consistent with the phase plan, but the
  gap should close no later than the P1 suite work. The new in-memory fakes in
  apps/api/src/modules/accounts/application/test-support/account-fakes.ts are a natural seed for
  that package when it lands.
- apps/api/src/modules/accounts/application/resolve-session.use-case.ts has no dedicated unit
  spec. Its expiry logic delegates to Session.isExpired, which is now boundary-tested, and the
  remaining composition (missing or expired session yields null) stays covered by the integration
  suite, so this does not reopen the blocking finding.

## Verdict

APPROVED
