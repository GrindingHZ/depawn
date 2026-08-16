# p7b-reconciliation-and-loan-book review

Fresh subagent review of `git diff 29ac659..HEAD`. Verdict BLOCKED on two findings, with three notes.

Scope note: the plan deferred versioned parameters and the outbox drain worker to p7c, so this
slice is reconciliation and the loan book only.

## Findings

1. [blocking] The ledger account check was a tautology. Both sides of the comparison summed the
   same rows of the same table with the same expression, so it could never disagree no matter what
   was corrupted. Balances are never stored, so there is no second copy to reconcile against, and
   shipping a dead check under the banner of making custody credible to an auditor is a false
   assurance rather than a narrower scope. Found and fixed before the review returned, which is
   worth recording honestly: the fix was already committed when the verdict arrived.
2. [blocking] The endpoints diverged from docs/04, which names `POST /admin/reconciliation/run` and
   `GET /admin/reconciliation/latest`. The slice shipped `POST` and `GET /admin/reconciliations`, a
   list rather than a latest, and the plan claimed they matched the contract when they did not.
3. [note] The list endpoint also ignored the blanket rule that every list is cursor paginated,
   which the move to a single latest run makes moot.
4. [note] `LoanBookQuery` and `ReconciliationHistoryQuery` inject PrismaService directly, the same
   shape of crossing that the boundary check caught in the use case. It matches the read model
   convention already established by the audit search query and the boundary tool does not flag it,
   but it is worth deciding deliberately before it spreads further.
5. [note] The admin screen hardcodes the demo vault with no selector, fine for the seeded demo and
   not for a multi vault deployment.

Confirmed clean by the reviewer: inventory drift genuinely checks both directions and the exit
criterion is met by a test that writes a corrupt status directly through Prisma, behind the
application, and watches it surface. The global ledger check is real and proven by disabling the
balance trigger to plant an unbalanced entry. The port is a sensible seam for the Phase 3 third
column. Exposure and recorded inventory both use IN_VAULT and ENCUMBERED consistently with rule C5.
The loan book buckets are mutually exclusive and match the loan state machine. Every new endpoint is
operations only with a 403 test. Money is bigint minor units throughout.

## Fixes applied

1. `fix(operations): check a ledger invariant that can actually fail` replaces the account check
   with the two that can: every ledger transaction's entries net to zero, and the ledger as a whole
   nets to zero. The planted imbalance test now proves both and names the offending transaction, so
   the report points at a row rather than saying the ledger is out somewhere.
2. `fix(admin): name the reconciliation routes as the contract does` moves to
   `POST /admin/reconciliation/run` and `GET /admin/reconciliation/latest`, returning the last run
   rather than a page. That is also what an operator opening the screen wants: the state of the last
   count, not a history to page through. Finding 3 dissolves with it.
3. Findings 4 and 5 left alone and recorded here. The read model convention predates this slice and
   changing it belongs in its own pass; the vault selector is P8 demo polish at most.

Gates after the fixes: `pnpm check` exit 0, reconciliation integration 7 of 7, e2e 20 of 20.
