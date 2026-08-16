# p8a-demo-hardening plan

P8 is the last phase of the Web2 product. It splits in two: this slice builds the demo dataset and
the runbook that walks it, and p8b does the accessibility and observability pass. The split is by
what can be proved: p8a ends with a Playwright test that walks the runbook, p8b ends with axe green
and metrics visible.

## Scope of p8a

A cold `pnpm db:seed` produces a database someone can be shown, `docs/DEMO.md` says what to click,
an admin control moves the clock, and a Playwright spec proves the runbook still works.

## Design decisions

**The seed drives use cases, not tables.** It boots a Nest application context and calls the same
use cases the HTTP layer calls. A seed that writes rows would encode today's shape of the schema and
would rot the first time a rule changes; a seed that goes through the application cannot produce a
state the product could not have reached. The one exception is the vault and the demo accounts,
which have no use case behind them and are already written directly.

**Loans at various maturities come from moving the clock, then putting it back.** A thirty day loan
that matures tomorrow cannot be created at one instant. The seed advances an offset clock, originates
at each point, and resets it at the end, so it hands back a clock at real time with a loan book whose
history is spread across weeks. This means the seed runs with the advanceable clock, which is the
same switch the demo clock control needs.

**Demo mode is an explicit flag, not NODE_ENV.** `DEMO_MODE=true` selects the advanceable clock and
mounts the test support module. Today both are keyed off `NODE_ENV === 'test'`, which is the wrong
key for a demo process. The flag defaults to false, so a deployed process is unchanged and the route
stays absent from the graph rather than merely refused.

**The runbook is a test.** `e2e/tests/demo.runbook.spec.ts` walks the click path in `docs/DEMO.md`
against the seeded database. If the runbook drifts from the product the spec fails, which is the only
way "executes without deviation" can be an exit criterion rather than a hope.

## Tasks

1. `feat(config): add a demo mode flag`: `demoModeEnabled` in configuration, read by ClockModule and
   AppModule so demo mode gets the advanceable clock and the clock route. NODE_ENV=test keeps working.
2. `test(config): demo mode mounts the clock route`: unit test on the flag, integration test that the
   route is absent without it.
3. `feat(seed): build the demo dataset through the use cases`: the seed boots an application context
   and produces: the Sydney vault with eight receipts in inventory, three live listings with competing
   offers, four active loans at different points between origination and maturity, one loan past its
   grace period and mid liquidation with two bids, and one completed cycle from deposit to redemption.
4. `test(seed): the seeded dataset holds the invariants`: an integration test that runs the seed
   against a Testcontainers database and asserts the ledger nets to zero, every loan is in the status
   the dataset claims, and the clock is back where it started.
5. `feat(admin): move the clock from the operations screen`: a demo only control that advances the
   clock by a day or to the next maturity, hidden when the API reports demo mode off.
6. `test(admin): the clock control advances a loan to maturity`: component test plus the endpoint.
7. `docs(demo): write the runbook`: `docs/DEMO.md`, the click path, the expected screen at each step,
   the credentials, and what to say.
8. `test(e2e): walk the demo runbook end to end`: the Playwright spec covering the runbook, in its
   own project ordered last because it moves the clock.

## What is deliberately not here

Accessibility, error copy coverage, and observability are p8b. The seed does not create a second
vault or a second currency: docs/00 says one vault and AUD only for Phase 1.

## Risks

- The seed is slow if it originates loans one at a time through the full stack. Budget is under a
  minute; if it exceeds that, the fix is fewer rows, not fewer use cases.
- Seeded listings appear in Browse, which several existing specs read. Those specs already open their
  own listing by id, but this needs checking rather than assuming.
