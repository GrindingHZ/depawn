# p7a-pause-and-audit review

Fresh subagent review of `git diff bdb36c7..HEAD`. Verdict APPROVED, with eight notes.

## The check that mattered

The reviewer walked both lists in flow 11 against the code. The six blocked entrances are exactly
the six named, each reading the pause as the first statement inside its transaction. None of the
nine never blocked paths can raise SYSTEM_PAUSED, directly or through any helper, confirmed by a
repository wide search for the port rather than by reading the six alone. Reclaiming a beaten
liquidation bid, which postdates flow 11 and so appears on neither list, is correctly left
unblocked because it returns money.

On the race: a pause landing microseconds after the check can let an in flight origination finish,
but the check precedes every write, so a losing race either commits wholly or aborts before
mutating anything. Nothing partial can be committed.

## Notes acted on

1. The phase plan says each path is asserted separately, and three tests had been combined: verify
   with release, default with claim, and open with bid. Five tests covered six blocked flows and
   seven covered nine exits. Now eighteen tests, one per path, with the shared setup factored into
   helpers rather than the assertions.
2. The audit route was `GET /admin/audit?subjectId=&actorId=`, while docs/04 names
   `GET /admin/audit-log?actor=&subject=`. The doc is normative and the divergence bought nothing,
   so the route and its parameters now match, keeping subjectType as an extra narrowing.
3. `withdraw_offer` recorded a hardcoded prior status of PENDING. Correct today, because the
   transition only succeeds from there, but it restates the rule instead of reading it; it now takes
   the status off the aggregate. `schedule_liquidation` gained the before its sibling already had.
4. Q-021 records the one leak worth a decision: the pause reason is readable by every signed in
   account, which is what lets a member see why an offer was refused, and is also the field an
   operator might use for an internal note.

## Notes left alone

- The guard's placement inside each use case rather than an interceptor was confirmed correct
  against docs/01 layering, and the domain files import nothing outside the domain.
- The open state read is deliberate and correctly ungated; pause, unpause, and the audit trail are
  operations only, each proven by a 403 test.
- Audit pagination is genuine keyset pagination over monotonic ids, proven across 28 entries.
- The e2e spec resets the pause in an afterEach, so a failure cannot leave the environment stuck.

Gates after the fixes: `pnpm check` exit 0, pause and audit integration 22 of 22.
