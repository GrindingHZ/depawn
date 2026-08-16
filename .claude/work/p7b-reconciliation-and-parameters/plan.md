# p7b-reconciliation-and-loan-book plan

Slice base: recorded at plan time. Flow 10 and the admin loan book.

The brainstorm warned this slice could grow too large. It has: versioned protocol parameters touch
every use case that reads them, and the outbox drain worker introduces the first background
process. Both move to p7c so this slice stays reviewable. The directory keeps its name because
renaming it would lose the brainstorm's history.

## Tasks

1. `feat(domain): add the reconciliation run and its drift rows`
   `ReconciliationRun` with a per vault result and `DriftRow` carrying the receipt id, the field,
   and the values that disagree. Drift is an incident, so a row names what to look at rather than
   summarising a count.
2. `test(domain): cover drift detection`
   A count that matches, a count that is short, a count that is over, and a receipt the count knows
   about that the database does not.
3. `feat(db): add reconciliation tables`
4. `feat(persistence): add the reconciliation repository`
5. `feat(operations): reconcile a vault against a physical count`
   One use case per run: read the receipts the database believes are in the vault, compare against
   the submitted count, write the run and its drift rows.
6. `feat(operations): reconcile the ledger against itself`
   Every account's derived balance against the sum of its entries, and the global sum against zero.
   Cheap because balances were never stored, and it is the check the whole build rests on.
7. `feat(api): expose reconciliation and the loan book`
   `POST /admin/reconciliations`, `GET /admin/reconciliations`, `GET /admin/loan-book`, and
   `GET /admin/exposure-by-vault`, all operations only, named as docs/04 names them.
8. `test(api): plant a corrupted receipt and see it as drift`
   The docs/07 exit criterion, written first: a receipt row edited behind the application's back
   shows up as a drift row naming the field and both values. Plus a clean vault producing no drift,
   and the ledger check catching a planted imbalance.
9. `feat(admin): add the reconciliation and loan book screens`
10. `test(e2e): run a reconciliation and read the drift`
11. Review by a fresh subagent, fixes as new commits, then the four gates and close.

## Notes

- The ledger imbalance test has to plant its imbalance with the balance trigger disabled, the same
  technique the P1 matcher test used, because the database refuses an unbalanced transaction.
- The loan book is entirely derived from loans and receipts, so it is a query and a screen with no
  new state.
