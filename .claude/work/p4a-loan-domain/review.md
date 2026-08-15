# p4a-loan-domain review

Two fresh subagent reviews were dispatched and neither returned a verdict: the first stopped on a
model usage limit, the second was stopped while running. The review below was therefore done in
session against the normative documents, which is weaker on independence and is recorded as such.

Scope: `git diff c5bd186..HEAD`.

## Flow 4 conformance

Steps 1 to 12 all sit inside one `unitOfWork.run`: listing lock, aggregate acceptance (ACTIVE,
unexpired, borrower, offer PENDING and unexpired), LTV re-check, release of the winning hold into
the borrower disbursement and the platform fee, encumbrance, loan creation with derived maturity
and grace, both notes minted, offer ACCEPTED and listing MATCHED, losers SUPERSEDED without refund,
and the LoanOriginated event. Step 4, the pause assertion, is deferred to P7 under Q-013.

## Findings

1. [blocking] `apps/api/test/origination.integration.spec.ts`: nothing exercises flow 4 step 3.
   The loan to value re-check is the only reason the policy is evaluated twice, and no test proves
   the second evaluation can reject. The cap itself is not editable until P7, but the same condition
   is reachable by lowering the receipt appraisal between the offer and the acceptance.
2. [note] `apps/api/src/modules/lending/application/accept-offer.use-case.ts:34` imports `holdOf`
   from the marketplace withdraw offer use case. Reconstructing a funds hold from an offer is now
   shared across two modules, and docs/09 asks for one primary export per file named after it.
3. [note] `apps/api/src/infrastructure/persistence/queries/prisma-loan-queries.ts`: `withHolder`
   issues one lender note query per loan, so a member with many loans pays a query each.

## Not findings

- Idempotency key reuse across two different acceptances is safe: the interceptor hashes method,
  url, and body, so the same key on a different offer path is rejected rather than replayed.
- A rejected encumbrance surfaces as its domain error through the use case catch and maps to 409,
  because every custody transition throws the entity's own error.
- Domain purity holds: `src/domain/lending` imports only domain modules, and the boundary check
  passes across 229 modules.

## Verdict

BLOCKED on finding 1. Findings 2 and 3 are worth taking in the same pass because both are small and
both touch code this slice introduced.

## Fixes applied

1. `test(api): prove the cap is re-checked at origination` revalues the collateral downwards
   between the offer and the acceptance, then asserts 422 LOAN_TO_VALUE_EXCEEDED with no loan, the
   listing still ACTIVE, the receipt still IN_VAULT, the offer still PENDING, and the hold intact.
2. `fix(lending): share the offer hold reconstruction across modules` moves `holdOf` out of the
   withdraw use case to `modules/shared/application/hold-of-offer.ts` as `holdOfOffer`, used by
   withdrawal, reclaim, and origination.
3. The same commit also flattens the lender note lookup in `PrismaLoanQueries` to one query per
   page. Deviation: `git add apps/api/src` swept both fixes into one commit whose message names
   only the first. Commits are not amended, so it is recorded here instead.

Gates after the fixes: `pnpm check` exit 0, origination and marketplace integration suites 9 of 9.
