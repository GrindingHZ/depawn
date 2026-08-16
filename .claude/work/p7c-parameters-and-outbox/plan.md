# p7c-parameters-and-outbox plan

Slice base: recorded at plan time. The last two P7 bullets.

## Tasks

1. `feat(db): add the protocol parameter version table`
   One row per version with an effective instant and the whole parameter set, plus who wrote it.
   History is the table; there is no update in place.
2. `feat(parameters): resolve the version in force`
   A registry that loads the versions and answers with the one effective now, refreshed when a new
   version is written. The `PROTOCOL_PARAMETERS` token keeps its shape, so no use case changes:
   every reader already asks the token rather than a constant.
3. `test(parameters): pin which version applies when`
   The version in force before an effective date is the previous one, on the instant it becomes
   effective it is the new one, and a future version does not apply early.
4. `feat(admin): edit the protocol parameters`
   `GET /admin/protocol-parameters` returning the current set and the history, and
   `PUT /admin/protocol-parameters` writing a new version with an effective date, operations only
   and audited.
5. `test(api): prove an edit changes new business and leaves old loans alone`
   The important one. Raising the origination fee changes what the next loan pays and does not
   change what an existing loan owes, because a loan carries its own terms.
6. `feat(db): add the dead letter table`
7. `feat(events): drain the outbox with retry`
   A worker that claims a batch under a row lock so two workers cannot publish the same event,
   marks delivered on success, counts attempts and backs off on failure, and moves a row past the
   limit to the dead letter table. Phase 1 has nowhere to publish, so the handler logs; the point
   is the machinery Phase 3 swaps a chain submission into.
8. `test(events): drain, retry, and dead letter`
   A batch drains once even when two workers race it, a failing handler retries and then dead
   letters, and a delivered event is never republished.
9. `feat(admin): show the parameters and the dead letters`
10. Review by a fresh subagent, fixes as new commits, then the four gates and close P7.

## Notes

- The worker must not start during tests unless a test asks it to, and must be stoppable so no
  timer outlives the process.
- Checked before planning: origination copies the rate, duration, and grace onto the loan, and
  interest derives from the loan's own fields, so only the liquidation fee could let a later edit
  reach an older loan. Task 5 asserts it does not.
