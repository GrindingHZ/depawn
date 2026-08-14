# CLAUDE.md

Operating instructions for this repository. Read this file completely before writing any code.

## What this project is

A collateralised lending marketplace for physical items. A borrower deposits an item at one of our
vaults. We appraise it, take custody, and issue a receipt. The borrower lists that receipt on a
marketplace. Lenders compete to fund a loan against it. On repayment the borrower redeems the item.
On default the lender takes the receipt and the item is liquidated.

We are a pawnbroker running a loan book on modern rails. We are not a trustless protocol.

## The one rule that governs every decision

**Phase 1 is Web2. Phase 3 is Web3. The domain layer must be identical in both.**

Money movement, custody, identity, and time reach the domain only through **ports** — interfaces
defined in the domain layer with no knowledge of Postgres, Prisma, HTTP, or Sui. Phase 1 supplies a
Postgres adapter. Phase 3 supplies a Sui adapter. Nothing in `src/domain/` changes.

If you are about to `import { PrismaService }` inside a domain file, stop. You have found the seam
and you are about to break it.

## Documentation index

Read in this order. Each is normative, not advisory.

| File | Contents |
|---|---|
| `docs/00-product-overview.md` | Domain, actors, glossary, business rules, non-goals |
| `docs/01-architecture.md` | Layers, ports, adapters, folder layout, dependency rules |
| `docs/02-domain-model.md` | Entities, value objects, state machines, invariants |
| `docs/03-ledger-and-money.md` | Double-entry ledger, money arithmetic, interest maths |
| `docs/04-api-contract.md` | Endpoints, DTOs, error model, idempotency, pagination |
| `docs/05-frontend.md` | Three apps, routing, state, component conventions |
| `docs/06-testing.md` | Test pyramid, port contract tests, Playwright, chain assertions |
| `docs/07-phase-plan.md` | Phases P0–P11, exit criteria, build order |
| `docs/08-web3-migration.md` | The pivot: what changes, what does not |
| `docs/09-conventions.md` | Naming, style, code review checklist, what not to do |
| `docs/10-flows.md` | Every end-to-end flow, step by step, with failure modes |
| `docs/11-execution-pipeline.md` | The autonomous loop, stage gates, hooks, how to run it |
| `docs/12-writing-and-commits.md` | Commit format and prose rules, both machine checked |
| `docs/13-design-system.md` | UI UX Pro Max, token freeze rule, visual regression |
| `docs/DESIGN-BRIEF.md` | The chosen tokens and their intended use, written in P0.5 |

## Stack

- Monorepo: pnpm workspaces + Turborepo
- Backend: NestJS, TypeScript strict mode
- Database: PostgreSQL 16, Prisma
- Frontend: Vite + React + TypeScript, TanStack Query, TanStack Router, Tailwind
- Design: UI UX Pro Max skill, used once at P0.5 to produce frozen tokens
- Tests: Vitest (unit + integration), Supertest (HTTP), Playwright (E2E), Testcontainers (Postgres)
- Later: Sui Move contracts, `@mysten/sui` SDK

## Workspace layout

```
apps/
  api/              NestJS backend
  marketplace/      Borrower + lender SPA
  vault-console/    Vault staff SPA
  admin/            Internal operations SPA
packages/
  contracts/        Shared request/response types + Zod schemas
  ui/               Shared React components and design tokens
  test-support/     Fixtures, builders, port contract suites
  move/             Sui package (Phase 3 only, empty until then)
docs/
```

## How this gets built

The build runs unattended through the loop in `docs/11-execution-pipeline.md`: brainstorm, plan,
execute, review, verify, iterate. Nobody reviews a diff by hand. State lives in `.claude/state/` and
`.claude/work/`, not in the context window, so a session can be killed and resumed at any point.

Commit at every green task, never once per slice. One line, `type(scope): summary`, no body, no
trailers, no attribution. Full rules in `docs/12-writing-and-commits.md`, enforced by
`scripts/check-commit-msg.sh`.

Prose rules are enforced by `scripts/check-prose.sh`, which runs inside `pnpm check` and on every
edit. No em dashes, no curly quotes, no emoji, no filler phrasing. This applies to commit messages,
comments, documentation, and UI copy alike.

## Working agreements

**Vertical slices, not layers.** Finish one flow end to end — domain, persistence, API, UI, E2E test —
before starting the next. Do not build "all the entities" then "all the endpoints". See
`docs/07-phase-plan.md`.

**One use case, one transaction.** Every write use case is a single atomic operation with a single
database transaction. This is what makes each use case translatable to one on-chain transaction
later. If a use case needs two transactions, the design is wrong — split the use case.

**Tests are part of the slice, not a later phase.** A slice is not done without unit tests on the
domain, an integration test through HTTP, and a Playwright test if it has UI.

**Migrations are never edited after they are applied.** Add a new migration.

**Do not invent scope.** If a requirement is ambiguous, implement the narrowest reading and add a
line to `docs/OPEN-QUESTIONS.md` rather than guessing broadly.

## Code style summary

Full rules in `docs/09-conventions.md`. The short version:

- Comments explain *why*, never *what*. If a comment restates the code, delete the comment and
  rename the thing instead.
- Name for the domain, not the pattern. `LoanOriginationService`, not `LoanManager`.
- No abbreviations. `principalAmount`, not `princAmt`. `receipt`, not `rcpt`.
- Booleans read as assertions: `isMatured`, `hasOutstandingBalance`, `canBeLiquidated`.
- Functions are verbs. Getters that compute are `calculate*` or `derive*`, not `get*`.
- No `any`. No non-null assertion (`!`) outside test fixtures. No `as` casts to silence the compiler.
- Classes for things with identity and behaviour (entities, services). Pure functions for
  calculations, mappers, and policies. Do not wrap a pure function in a class to look object-oriented.
- Files kebab-case, one primary export per file, named after the export.

## Commands

```
pnpm install
pnpm db:up                 docker compose up postgres
pnpm db:migrate            prisma migrate dev
pnpm db:seed               seed demo fixtures
pnpm dev                   all apps in watch mode
pnpm test                  unit + integration
pnpm test:e2e              playwright
pnpm check                 typecheck + lint + format + boundaries + prose + tokens
./scripts/autopilot.sh     run the pipeline until STATE.md reports complete
```

Run `pnpm check` before considering any task complete.

## Definition of done for a slice

1. Domain logic implemented with unit tests, no infrastructure imports.
2. Prisma adapter implemented, passing the shared port contract suite.
3. HTTP endpoint with DTO validation and mapped error responses.
4. Integration test hitting the endpoint against a real Postgres via Testcontainers.
5. UI implemented in the correct app, wired to real endpoints, no mock data, tokens only.
6. Playwright test covering the happy path and the primary failure path.
7. `pnpm check` clean.
8. `docs/10-flows.md` updated if the flow changed.
9. Committed in small steps, one commit per task, messages matching `docs/12-writing-and-commits.md`.
