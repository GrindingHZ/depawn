# p7c-parameters-and-outbox brainstorm

## Goal

The last two P7 bullets: protocol parameters editable with an effective date and full history, and
the outbox drain worker with retry and a dead letter table.

## Versioned parameters

Today a frozen object is injected at startup and every use case reads it. Making it versioned means
a table of rows, each with an effective date, and a read of the version in force now.

The rule that shapes the design: a loan already originated keeps the terms it was originated under.
Nothing may reread the current parameters to reinterpret an existing loan. That is already true by
accident, because origination copies the rate, the duration, and the grace period onto the loan, and
interest is computed from the loan's own fields. The fee basis points are read at origination and
at liquidation, and the liquidation fee is the one place where a later edit would change the
outcome of an older loan. Worth checking rather than assuming.

Design: keep `PROTOCOL_PARAMETERS` as the injection point so no use case changes, but resolve it
per request from the version in force rather than from a constant. The alternative, passing
parameters through every call, would touch every use case for no gain.

## Outbox drain worker

Events have been written to the outbox since P1 and never drained. The worker claims a batch,
publishes, and marks them delivered; a failure increments an attempt count and backs off; a row
past the attempt limit moves to a dead letter table for a human.

Phase 1 has nowhere to publish to, so the drain is a logged handler. That is honest rather than
useless: the point is the machinery, so that Phase 3 swaps the handler for the chain submission
without inventing the queue.

## Risks

- The worker is the first background process. It must not run in the request path, must be
  stoppable so tests do not leak timers, and must not run during integration tests unless a test
  asks it to.
- Claiming a batch needs the same care as any concurrent read: two workers must not publish the
  same event twice, which means a claim with a row lock rather than a read then update.
- A parameters edit must be audited like every other operator action.
