# p8a-demo-hardening brainstorm

## Goal

The last phase. docs/07 says the Web2 product is complete at the end of P8, and its exit criteria
are concrete: a cold `pnpm db:seed && pnpm dev` reaches a demo ready state in one command, the full
Playwright cross app test passes, and the demo runbook executes without deviation.

## What P8 asks for

1. A seed producing a realistic dataset: a vault with inventory, live listings with competing
   offers, active loans at various maturities, one defaulted loan mid liquidation, and one
   completed cycle. Today's seed is 43 lines: three accounts and a vault.
2. `docs/DEMO.md`: the exact click path and the expected screen at each step.
3. Empty states, loading skeletons, and error copy for every error code.
4. An accessibility pass with axe green on the primary routes.
5. The test clock wired to an admin control so a demo can jump a loan to maturity live.
6. Basic observability: structured logs, a health endpoint, request duration metrics.

## What is already true

Skeletons and empty states exist on every screen built so far, because each slice included them.
The health endpoint exists from P0. The test clock endpoint exists from P5 but is test only and has
no control in the interface. Error copy exists per screen but has never been checked against the
full error code list, which is the gap worth measuring rather than assuming.

## Shape of the work

The seed is the centre of it: everything else is either already done or small. The seed has to
build its dataset through the same use cases the product uses, not by writing rows, or it will
drift from reality the moment a rule changes. That means driving it through the application, which
is slower to write but is the only version that stays honest.

The realistic dataset needs the clock to move, because a loan at various maturities cannot exist at
one instant. The seed can advance an offset clock the same way the tests do, or it can write
loans with explicit dates through the use cases and let the clock stay put. The second is
preferable: a seed that leaves the clock shifted would surprise anyone who ran it.

## Risks

- A seed that drives the application is slow. If it takes minutes the exit criterion of one command
  is technically met and practically annoying.
- The axe pass may surface real accessibility defects across screens built over many slices. That
  is the point, but it could be a long tail; the criterion is the primary routes, not every route.
- Splitting is likely: seed and runbook first, then accessibility and observability.
