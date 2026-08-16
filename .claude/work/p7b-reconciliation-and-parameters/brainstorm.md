# p7b-reconciliation-and-parameters brainstorm

## Goal

The rest of P7: reconciliation, the loan book, versioned protocol parameters, and the outbox drain
worker. What makes the product defensible to an operator and an auditor rather than only to a user.

## Reconciliation (flow 10)

For each vault, compare the operator's physical count against the database receipts in IN_VAULT or
ENCUMBERED, and produce a drift row per disagreement carrying the receipt id, the field, and both
values. Drift is an incident routed to a human, not a report line.

Also reconcile the ledger: every account's derived balance against the sum of its entries, and the
global sum against zero. The ledger half is cheap because balances are already derived rather than
stored, so the check is that the invariant the whole build rests on actually holds in the data.

Exit criterion from docs/07: a deliberately corrupted receipt row shows up as drift. That is the
test to write first, because a reconciliation that cannot see a planted error is theatre.

## Loan book

An admin read: outstanding, overdue, at risk, and exposure by vault. All derivable from the loan
and receipt tables, so it is a query and a screen rather than new state.

## Protocol parameters

Editable with an effective date and full history, which means a table of versions rather than a
mutable row. Every use case currently reads a frozen object injected at startup; making it a query
against the version effective now is the real change, and it must not disturb the ports.

## Outbox drain worker

The outbox table has been written to since P1 and never drained. This adds the worker with retry
and a dead letter table.

## Risks

- The parameters change touches every use case that reads them, so it is the largest blast radius
  in the slice. A loan already originated must keep the terms it was originated under, so nothing
  may read the current parameters to reinterpret an existing loan.
- The drain worker introduces the first background process. It needs to be stoppable in tests, and
  it must not run inside the request path.
- This slice is large. If it grows past a comfortable size, the parameters history and the worker
  split into p7c rather than being rushed.
