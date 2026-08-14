# 09: Conventions

The goal is code a person can read at 4pm on a Friday and understand without asking anyone. Every rule
here exists to serve that.

## Naming

**Use the glossary.** If `docs/00-product-overview.md` says *custody receipt*, the class is
`CustodyReceipt`, the table is `custody_receipt`, the route is `/receipts`, and the UI says "receipt".
Never introduce a synonym. A codebase where the same concept has three names is a codebase where
nobody is sure whether two things are the same thing.

**No abbreviations.** `principalAmount` not `princAmt`. `annualPercentageRateBasisPoints` not `apr`.
Yes it is long, and it is long in a way that prevents someone passing a percentage where basis
points are expected. Accepted exceptions, and the list is closed: `id`, `url`, `http`, `api`, `db`
in infrastructure filenames only.

**Names carry units.** Anything with a unit says so: `durationMs`, `minorUnits`, `basisPoints`,
`epochMilliseconds`. A bare `amount` or `rate` or `duration` is a bug waiting to be introduced by the
next person.

**Booleans read as assertions.** `isMatured`, `hasOutstandingBalance`, `canBeLiquidated`,
`requiresDualAppraisal`. Never `flag`, `status` for a boolean, or a negative like `isNotExpired`.

**Functions are verb phrases.**

| Prefix | Use for |
|---|---|
| `calculate` | Pure computation returning a value |
| `derive` | Pure transformation from other state |
| `assert` | Returns `Result<void, E>`, used for policy checks |
| `find` | May return null |
| `require` / `load` | Throws or fails if absent |
| `record` | Persists a fact that happened |
| `build` | Constructs without side effects |

Reserve `get` for trivial property access. If it queries, computes, or can fail, it is not a `get`.

**Class names describe the thing, not the pattern.** `LoanOriginationService`, not `LoanManager` or
`LoanHelper` or `LoanUtils`. Banned suffixes: `Manager`, `Helper`, `Util`, `Utils`, `Data`, `Info`,
`Processor`, `Handler` as a domain noun. If you cannot name a class without one of these, it does
more than one thing.

**Use cases are named as commands.** `AcceptOfferUseCase`, `RequestRedemptionUseCase`. One public
method: `execute`.

## Files

- kebab-case: `custody-receipt.ts`, `accept-offer.use-case.ts`, `listing-detail.tsx`
- One primary export per file, and the file is named after it
- Suffixes carry meaning: `.use-case.ts`, `.repository.ts`, `.adapter.ts`, `.port.ts`, `.policy.ts`,
  `.mapper.ts`, `.spec.ts`
- Barrel files (`index.ts`) only at package boundaries, never inside a module. They obscure the
  dependency graph and slow down builds.

## Comments

**Comments explain why. Code explains what.**

```ts
// Bad: restates the code
// Check if the loan has matured
if (loan.maturesAt.isBefore(now)) { ... }

// Bad: narrates the obvious
// Loop through the offers
for (const offer of offers) { ... }

// Good: explains a decision that is not visible in the code
// Truncating division rounds interest in the borrower's favour, which is the
// direction consumer credit rules require. Do not switch to rounding half-up.
return Money.of(numerator / denominator, principal.currency);

// Good: explains a constraint from outside the code
// Bounded to a single hold release because the Phase 3 equivalent is one PTB
// and iterating over every losing offer would exceed gas limits.
```

If a comment describes what a block does, delete the comment and extract a well-named function
instead. The function name is a comment the compiler checks.

No commented-out code. No `TODO` without an issue reference. No file-header banners. No JSDoc that
restates the type signature; the types are already there.

## Classes versus functions

Not a religion. Use the one that fits.

**Classes for:** entities with identity and a lifecycle (`Loan`, `Listing`), value objects with
invariants (`Money`), services with injected dependencies (use cases, adapters, repositories).

**Functions for:** calculations (`calculateAccruedInterest`), policies
(`assertWithinLoanToValue`), mappers (`toListingRow`), ranking, formatting, anything that is input
in and output out.

Do not wrap a pure function in a class with a single method to make it look object-oriented. A class
with no state and one method is a function with extra ceremony.

Do not make everything a function either. `Loan.calculateAmountDue(now)` reads better than
`calculateAmountDue(loan, now)` because the loan is the subject.

## TypeScript

- `strict: true`, plus `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`
- No `any`. If you truly need it, `unknown` plus a narrowing function.
- No `!` non-null assertion outside test fixtures.
- No `as` to silence the compiler. `as const` and branded-type constructors are fine.
- Prefer discriminated unions over optional fields. `{ status: 'ACTIVE'; maturesAt: Instant } |
  { status: 'REPAID'; repaidAt: Instant }` beats an object where both are optional and you have to
  know which combinations are legal.
- Exhaustiveness checks on every union switch:

```ts
function assertNever(value: never): never {
  throw new Error(`Unhandled variant: ${JSON.stringify(value)}`);
}
```

Adding a state without handling it becomes a compile error. This is how state machines stay correct
as they grow.

- Readonly by default. `readonly` fields, `ReadonlyArray` parameters. Mutation should be a deliberate
  act.

## Domain purity

The rules that keep the Web3 pivot cheap, restated because they are the ones most likely to erode:

- No imports from `infrastructure/`, `@prisma/client`, `@nestjs/*`, or `@mysten/*` inside `domain/`
- No decorators in `domain/`
- No `new Date()` or `Date.now()` outside the clock adapter
- No `Math.random()` or `crypto.randomUUID()` in the domain; take an `IdGenerator`
- No `process.env` outside `config/`
- No `console.*` anywhere; use the injected logger
- Domain methods return `Result` for expected failures and throw only for programmer errors

Enforce all of it with `dependency-cruiser` and ESLint rules in CI. Documented-but-unenforced
architecture decays within a month.

## Database

- Tables singular snake_case: `custody_receipt`, `ledger_entry`
- Every table: `id`, `created_at`, `updated_at`. Mutable aggregates also carry `version` for
  optimistic concurrency.
- Money columns are `BigInt` minor units plus a separate `currency` column. Never `Decimal`, never
  `Float`.
- Enums as Postgres enums, generated into TypeScript by Prisma, and the domain has its own
  independent union type. The mapper translates. This is a small duplication that stops a schema
  change silently rewriting domain semantics.
- Foreign keys always. Cascading deletes never; deletion of a financial record is an event, not a
  side effect.
- Migrations are append-only. Never edit an applied migration.

## HTTP layer

Controllers are thin. Validate, call one use case, map the result, return. No business logic, no
`if` chains on domain state, no direct repository access.

```ts
@Post(':listingId/offers/:offerId/accept')
async acceptOffer(
  @Param() params: AcceptOfferParams,
  @CurrentAccount() account: Account,
  @IdempotencyKey() key: string,
): Promise<AcceptOfferResponse> {
  const result = await this.acceptOffer.execute({
    listingId: params.listingId,
    offerId: params.offerId,
    requestedBy: account.id,
    idempotencyKey: key,
  });

  return unwrapOrThrowHttp(result, toAcceptOfferResponse);
}
```

If a controller method is over fifteen lines, logic has leaked into it.

## Git

- Conventional commits: `feat(marketplace): accept offer and originate loan`
- Branch per slice: `slice/p4-origination`
- A pull request is one slice and includes its tests. A PR that adds an endpoint without a test is
  not reviewable.
- PR description states which flow in `docs/10-flows.md` it implements.

## Review checklist

Paste this into the PR template.

- [ ] Domain layer imports nothing from infrastructure, NestJS, or Prisma
- [ ] The use case is exactly one `unitOfWork.run` call
- [ ] Expected failures are `Result`, not thrown
- [ ] Every new error code exists in `packages/contracts` and has frontend copy
- [ ] Money is `bigint` minor units with a currency; no `number`, no float
- [ ] Time comes from `ClockPort`
- [ ] The mutation endpoint honours `Idempotency-Key`
- [ ] State transitions go through the transition table, not ad-hoc conditionals
- [ ] Union switches have an exhaustiveness check
- [ ] Domain unit tests cover the happy path and every rejection
- [ ] Integration test asserts the ledger sums to zero
- [ ] Concurrency test exists if two users can act on the same resource
- [ ] Playwright test covers the happy path and the main failure
- [ ] No comment restates code; no commented-out code
- [ ] Names carry units where a unit exists
- [ ] Nothing here would need rewriting to run against the chain

## What not to do

A list of specific mistakes, each of which has a real cost in this codebase.

**Do not store a balance column.** Derive from ledger entries. See `docs/03-ledger-and-money.md`.

**Do not use floating point for money.** Not for display, not "just for the estimate", not in a chart.

**Do not put business logic in a Prisma query.** A clever `WHERE` clause that encodes a policy is a
policy that cannot be unit tested and cannot move to Move.

**Do not spread one use case across two transactions.** If it does not fit in one, the use case
boundary is wrong.

**Do not iterate over an unbounded collection inside an operation.** Bound it or make it a pull.

**Do not add a role check inside domain code.** Authorisation belongs at the use case boundary, where
it becomes a capability parameter in Phase 3.

**Do not fetch in `useEffect`.** TanStack Query exists.

**Do not use CSS selectors in Playwright.** Roles and test ids only.

**Do not use `waitForTimeout`.** Wait on a condition.

**Do not write a test that asserts on an error message string.** Assert on the code.

**Do not mock what you own.** Mock the clock and third-party HTTP. Use the real database in
integration tests, the real domain everywhere.

**Do not add a field to a domain entity because the UI needs it.** Add a read model.

**Do not name anything `Manager`, `Helper`, `Util`, `Data`, or `Info`.**

**Do not skip the audit log on a state transition.** Every one, without exception. It is the record
you will need on the one day it matters.

**Do not let a pause block an exit path.** Repayment, redemption, reclaim, and default claim must
always work.
