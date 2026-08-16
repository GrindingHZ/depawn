# p8a-demo-hardening review

Fresh subagent, slice base `168777e`, no knowledge of the implementation session.

## Verdict

BLOCKED, four blocking findings. All fixed as new commits.

## Blocking

1. **The accessibility pass audited a route that does not exist.** The spec listed `/browse` as a
   marketplace primary route. The real route is `/listings`. An unmatched path renders almost
   nothing, and almost nothing cannot violate anything, so the scan reported green on the one screen
   the whole demo revolves around. This is the exact vacuous pass the review was asked to look for,
   and the reviewer found it.
2. **No route proved it had rendered before being scanned.** Same failure mode, one step removed: a
   screen that silently failed to load would have passed. Every route now names something only the
   real screen renders, and the scan does not run until it is on the page.
3. **The runbook spec never touched the demo dataset or the demo clock.** The e2e suite runs the api
   under NODE_ENV=test with an in memory clock and an accounts only seed, so the mechanism the whole
   phase rests on, an offset written in one process and read in another, had no automated proof.
4. **The plan said the seed resets the clock, and it deliberately does not.** The reversal was
   correct and was already explained in the code and in the runbook, but the plan still said the old
   thing and nothing recorded the consequence.

## Notes carried

5. Ordinary development inherits the demo offset, because `pnpm dev` is demo mode.
6. Four commits used scopes not in the list in docs/12, and one was labelled `docs(readme)` while
   touching only CLAUDE.md. The checker never enforced the list.
7. The test clock controller comment still said NODE_ENV=test.
8. The clock control shipped with fixed jumps rather than the jump to next maturity the plan named.
9. Route metrics grow unbounded on garbage paths.
10. docs/10 had no flow for the demo clock.
11. The seed truncates with no guard against a wrong DATABASE_URL.

## Disposition

1, 2, and 3 fixed. The accessibility spec now walks fifteen real routes across three apps, each
asserting rendered content first. A new suite in `seed.integration.spec.ts` starts the real
`pnpm dev` entry point against a freshly seeded database and reads the loan book, the listings, and
the sale back over HTTP: three loans outstanding, none overdue, one defaulted, one sale taking bids.
That is the one command exit criterion checked rather than assumed, and it is the only test that
exercises `DemoClockAdapter` across a process boundary.

4 fixed by recording the reversal in the plan where the wrong claim was, rather than editing the
claim away, and 5 became Q-024.

6 fixed in the place that lets it happen: `scripts/check-commit-msg.sh` now enforces the scope list,
and docs/12 says so. The four commits themselves stand, since history is not rewritten here.

7, 10, and 11 fixed. 8 recorded in the plan as a deliberate reduction: the runbook only ever crosses
a maturity or a holding period and both are fixed lengths. 9 left alone: an internal endpoint on a
demo deployment, and an eviction policy would be more machinery than the problem.

## Reviewer's positive findings, kept for the record

The error copy rollout preserves every screen's specific message and only replaces the generic
fallback. The admin navigation refactor drops no link and highlights correctly. The liquidation fee
pinning is a sound domain change that keeps the port boundary clean.
