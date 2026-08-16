# p8a-demo-hardening verify

## Gates

| Gate | Result |
|---|---|
| `pnpm check` | clean: typecheck, lint, format, boundaries, prose, tokens |
| Unit | 156 in the api, 93 in contracts, the ui package unchanged, all passing |
| Integration | 156 tests across 28 files, all passing |
| Playwright | 32 tests across 11 projects, all passing |

## P8 exit criteria, one at a time

**A cold `pnpm db:seed && pnpm dev` reaches a demo ready state in one command.** It does now, and it
did not when the phase started: the api had no `dev` script at all, so `pnpm dev` brought up three
front ends and nothing to serve them. `apps/api/src/dev.ts` is the entry point, it sets demo mode
before the graph decides which clock it runs, and the second suite in `seed.integration.spec.ts`
starts that exact file against a freshly seeded database and reads the result back over HTTP.

**The full Playwright cross app test passes.** 32 tests. The ordering chain has grown to eleven
projects because several specs share one mutable clock, one pause flag, and one set of protocol
parameters; each of those runs alone, after everything it could disturb, and puts back what it
moved.

**The demo runbook executes without deviation.** `docs/DEMO.md` and `e2e/tests/demo.runbook.spec.ts`
walk the same six steps across three apps. The spec builds its own cast rather than reading the demo
dataset, for the reason every other spec does, and the dataset itself is proved separately against a
process started the way a demo starts one.

## What the phase asked for, and where it is

- **The seed.** `apps/api/prisma/seed.ts` boots the application and drives real endpoints. Eight
  receipts, three live listings with two competing offers each, three loans running at a fortnight,
  six weeks, and three months, one completed cycle from deposit through repayment to the item
  leaving the building, and one defaulted loan whose sale is taking bids.
- **The runbook.** `docs/DEMO.md`, twelve minutes, with the accounts, the click path, the expected
  screen at each step, what to say, and what to do when something goes wrong.
- **Empty states, skeletons, error copy.** The first two came with each slice. The third is
  `packages/contracts/src/error-copy.ts`: a sentence for all 46 codes, proved exhaustive by walking
  the code table rather than sampling it, wired into 16 screens as the fallback beneath each
  screen's own specific messages.
- **Accessibility.** `e2e/tests/accessibility.spec.ts`, axe green on serious and critical across
  fifteen routes and three login screens, each asserting the screen rendered before it scans.
- **The clock control.** On the admin parameters screen, present only when the process it is talking
  to reports demo mode.
- **Observability.** One JSON object per request with a correlation id, a route shape, a status and
  a duration; `GET /admin/metrics` behind the operations role for count, average, worst case, and
  fault count per route; the health endpoint now also reports whether the process is a demo.

## Two things the tests caught that a reading would not have

The seed originally left active loans dated ahead of a fresh process's clock, because a clock that
only runs forwards cannot be reset without stranding the dataset behind it. The fix was to write the
offset down and reorder the story so the loans meant to still be running are created after the
jumps. Its own test is what failed and said so.

The e2e suite could not have caught the first one, because it never ran the full seed. The reviewer
caught that, and the answer was a suite that starts a real demo process rather than an argument
about why it was probably fine.

## Honest limitations

A clock jump longer than a week signs everyone out, because sessions are measured against the same
clock as everything else. This is stated on the control, at the step in the runbook where it
happens, and in the troubleshooting table, rather than being special cased away.

Ordinary development shares the demo clock, so a developer's api is dated weeks out after a seed.
Recorded as Q-024.

The Web2 product is complete. Everything after this is the pivot.
