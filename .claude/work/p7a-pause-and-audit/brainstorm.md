# p7a-pause-and-audit brainstorm

## Goal

The two safety features that make the product defensible: a pause switch that can never trap
anyone's money, and an audit trail an auditor can search.

Splitting P7 in two. This slice takes pause and audit; p7b takes reconciliation, the loan book, the
parameter history, and the outbox drain worker.

## Pause

`POST /admin/pause` and `/admin/unpause`, operations only, plus a read for the banner.

Flow 11 fixes both lists exactly, and rule S2 makes the second one a safety property rather than a
convenience:

- Blocked: create listing, publish listing, place offer, accept offer, open liquidation, place bid.
- Never blocked: repay, request redemption, verify, release, withdraw offer, reclaim hold, mark
  default, claim receipt, close an already open liquidation.

Design: a `SystemStatePort` read inside each blocked use case at its entrance, and a `SystemPaused`
domain error mapped to 422. Putting the check in a guard or interceptor would be shorter but wrong:
the list is a domain rule about which flows may run, not an HTTP concern, and a guard would sit at
the wrong layer to be read by the Sui adapter later. Q-013 recorded this deferral from P4.

The exit criterion is stated as separate assertions, so each never blocked path gets its own test
rather than one test looping a list. Nine of them, and they are the point of the slice.

## Audit

The audit port already records every state transition, and each use case writes one. What is
missing is the read side: `GET /admin/audit?subjectType=&subjectId=&actorId=&cursor=` with the
before and after values already stored. A short slice, mostly a query and an admin screen.

## Risks

- A pause check added to a use case is easy to forget, so the test list is the specification. The
  blocked list gets a test each too, which is six more.
- The pause flag is global state read by many use cases. It belongs in its own table with a single
  row rather than a parameters column, because P7b makes parameters versioned with effective dates
  and a pause has no effective date, it is on or off now.
- Closing an already open liquidation must keep working while paused, which means the pause check
  goes on open and bid but not on close. That asymmetry is deliberate and worth a comment.
