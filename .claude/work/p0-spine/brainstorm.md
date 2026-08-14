# P0 spine: split decision

P0 covers monorepo tooling, the domain kernel, database and API scaffolding, auth, three frontends,
the test harness, and CI. That is far more than twelve tasks, so P0 is split into five slices, each
run through the full pipeline loop:

1. `p0a-tooling`: pnpm workspaces, Turborepo, TypeScript strict config, ESLint with boundary rules,
   Prettier, `pnpm check` wiring the prose and token scripts, commit message hook.
2. `p0b-domain-kernel`: `Money`, `Instant`, branded ids, `Result`, `DomainError`, `DomainEvent`,
   the six port interfaces, system and fixed clock adapters, unit tests under Vitest.
3. `p0c-api-db`: NestJS app skeleton, Docker Compose Postgres, Prisma schema and initial migration,
   `PrismaService`, `PrismaUnitOfWork`, global error filter, correlation id logging, Testcontainers
   harness with `createTestApplication`, truncation, and the `toSumToZero` matcher.
4. `p0d-auth`: register, login, logout, `GET /me`, argon2id hashing, session cookie, role guard,
   idempotency record storage, integration tests.
5. `p0e-apps-e2e`: the three Vite apps with routing and a login screen, Playwright with three
   projects, login end to end tests, CI workflow, and the deliberate boundary violation test.

Exit criteria for P0 as a whole stay as written in `docs/07-phase-plan.md` and are checked at the
close of `p0e-apps-e2e`.

Environment notes recorded during stage 0: Node 24.11.1, pnpm 11.21.0 installed via npm global
prefix, Docker CLI 29.0.1 present but the daemon was not running at session start. The daemon must
be started before `p0c-api-db` integration tests run.
