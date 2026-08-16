# p7c-parameters-and-outbox review

Fresh subagent, slice base `52baaad`, no knowledge of the implementation session.

## Verdict

BLOCKED, three blocking findings.

## Blocking

1. **The liquidation fee reaches an older loan.** `close-liquidation.use-case.ts` reads
   `liquidationFeeBasisPoints` from the live parameters object at close time. Since this slice made
   that object resolve to the version in force now, an operator can edit the fee with a past
   effective date and change what is taken from a liquidation whose loan originated under a
   different fee. The slice's own plan claimed task 5 proved this could not happen; it did not, it
   only exercised the origination fee, which is copied onto the loan and is genuinely immune. The
   reviewer is right and the plan was wrong.
2. **The parameter write and its audit are two transactions.** `admin.controller.ts` calls
   `registry.write` and then opens a separate `unitOfWork.run` for the audit entry. A failure
   between them leaves an edit with no audit record, against the one use case one transaction rule
   and against the rule that every state transition is audited. The write logic also sits in the
   controller rather than a use case.
3. **Task 9 was never built.** The plan's admin screen for the parameters and the dead letters does
   not exist, so the slice has no UI and no Playwright coverage, failing items 5 and 6 of the
   definition of done.

## Notes carried

4. The registry is per process, so a write on one replica leaves another serving the old version
   until it restarts. Phase 1 runs one process; this belongs in OPEN-QUESTIONS rather than in code.
5. The harness refresh after truncate exists because of the same caching. Worth a comment saying
   production has no analogous path.
6. `fromStoredParameters` hardcodes AUD for the dual appraisal threshold and the writer never
   records the currency. Harmless while Phase 1 is single currency, but the round trip loses it.
7. The outbox is at-least-once, not exactly-once: a crash between a successful publish and the
   `published_at` write republishes after the visibility window. Harmless for a log line, not
   harmless for a chain submission in Phase 3.
8. No test advances the clock past the visibility window, so the reclaim path the window exists for
   is unproven.

## Disposition

1, 2, and 3 fixed as new commits. 4 and 7 recorded in `docs/OPEN-QUESTIONS.md` as Q-022 and Q-023,
because both are Phase 3 decisions rather than Phase 1 defects. 5, 6, and 8 fixed as new commits,
since each is small and each is a real gap.
