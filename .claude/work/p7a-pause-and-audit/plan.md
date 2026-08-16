# p7a-pause-and-audit plan

Slice base: recorded at plan time. Flow 11 and the audit read side.

## Tasks

1. `feat(domain): add the system state port`
   `SystemStatePort` with `isPaused(context)`, a `SystemPaused` domain error, and the token. The
   check belongs in the domain because which flows may run is a domain rule, not an HTTP concern.
2. `feat(db): add the system state table`
   One row, pausedAt nullable, pausedByAccountId, reason. A pause has no effective date, so it does
   not belong with the versioned parameters p7b introduces.
3. `feat(persistence): add the system state adapter`
4. `feat(admin): pause and unpause the system`
   `POST /admin/pause` and `/admin/unpause`, operations only, plus `GET /admin/system-state`.
   Each writes an audit entry naming who pulled the switch and why.
5. `feat(marketplace): block the six paused flows`
   The pause check at the entrance of create listing, publish listing, place offer, accept offer,
   open liquidation, and place bid. Exactly the flow 11 list, no more.
6. `test(api): prove every blocked flow is blocked`
   Six assertions, one per flow, each expecting 422 SYSTEM_PAUSED and no state change.
7. `test(api): prove every exit path still works while paused`
   Nine assertions, one per never blocked flow: repay, request redemption, verify, release,
   withdraw offer, reclaim hold, mark default, claim receipt, and close an already open
   liquidation. This is the slice's reason to exist: a pause that traps money is an attack surface,
   so each path gets its own test rather than one loop over a list.
8. `feat(api): expose the audit trail`
   `GET /admin/audit?subjectType=&subjectId=&actorId=&cursor=` reading the entries every use case
   already writes, operations only, cursor paginated like the ledger history.
9. `test(api): search the audit trail`
   Filters compose, pagination is stable, and an entry carries actor, subject, before, and after.
10. `feat(admin): add the pause control and the audit search`
    A pause switch stating plainly what stops and what keeps working, and an audit table.
11. `test(e2e): pause the system and prove a repayment still works`
    The demo of rule S2 in the interface.
12. Review by a fresh subagent, fixes as new commits, then the four gates and close.

## Notes

- Q-013 recorded the deferral of the origination pause check to this slice; closing it here.
- Closing an already open liquidation stays available while paused, so the check goes on open and
  bid but not on close. Deliberate asymmetry, worth a comment where it lands.
- The integration suite already runs past ten minutes, so the new tests go in their own file and
  the verify step runs the suite in the background.
