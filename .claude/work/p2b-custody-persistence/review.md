# p2b-custody-persistence review (re-review after blocking fix)

Base 591d6cc, head 84be6e5, eight commits. Verified mechanically on this pass: pnpm check
exit 0, pnpm test:unit exit 0. The new integration spec was read in full; the implementer
reports 3/3 green against Testcontainers and the spec structure is consistent with that claim.

## Blocking

None. The prior blocking finding is resolved by 84be6e5, which adds
`apps/api/test/custody-repositories.integration.spec.ts`:

- `exposureOf` is now tested directly: three receipts issued, one encumbered, one burned; the
  query must return the IN_VAULT plus ENCUMBERED sum (500 000 minor units) with the burned
  receipt excluded, which pins the raw SQL status filter enforcing rule C5.
- The intake repository round trips draft, evidence Json, seal number, seal against the listed
  appraisals, reload with matching sealed hash, evidence deep equality, and the version bump.
- The appraisal repository round trips save and `listByIntake` with a Money value check.
- The vault repository is exercised through `save` in setup and implicitly through the issue
  path reading the insured limit; the stale receipt save proves the optimistic `updateMany`
  version check raises `StaleReceiptVersionError`.

Accepted deferral: the vault lock's serialisation under concurrency is not proven in this
slice. That is acceptable because the lock only carries meaning when combined with the exposure
check inside the issue-receipt use case, which is p2c scope; the p2c issue-receipt concurrency
test must exercise it. If p2c ships without that test, this deferral becomes a blocking finding
there.

## Non-blocking

- New: the stale save test guards its assertion with `if (transferAttempt.ok)` and no preceding
  `expect(transferAttempt.ok).toBe(true)`. Today `transferHolder` is a legal IN_VAULT event per
  the transition table, so the throw path runs; if that rule ever changed the test would pass
  while asserting nothing. Add the assertion when next touching the spec.
- The exposure test covers the status filter but only one currency; the currency filter in the
  raw SQL is still untested. Low risk, worth a second-currency row when a multi-currency
  fixture exists.
- `custody.mapper.ts` passes Prisma enum values (`row.status`, `row.itemCategory`) straight into
  the domain `restore` calls, relying on structural assignability. `account.mapper.ts` set the
  pattern of explicit translation tables as "the only translation point" per docs/09 ("the mapper
  translates"). Compile-time assignability still catches a diverging value, so this is a
  consistency deviation, not a safety hole.
- docs/09 says foreign keys always. `custody_receipt.holder_account_id` and
  `intake_record.borrower_account_id` have no foreign key to `account`, which exists.
  `appraiser_id` and `encumbered_by_loan_id` have no referenceable table yet, so those are fine
  for now.
- The custody adapter returns `SettlementRef` with kind `ledger` and a generated ulid, but
  `settlement-ref.ts` documents the Phase 1 reference as a ledger transaction id. The adapter
  comment explains the choice; the brainstorm attributes the gap to Q-010, which is about hold
  release kinds, not custody references. A dedicated OPEN-QUESTIONS entry would match the
  CLAUDE.md ambiguity rule better than a code comment alone.
- The contract suite asserts rejections with bare `rejects.toThrow()`, so a wrong error class
  still passes. docs/09 says assert on the code. This copies the settlement suite precedent, so
  it is flagged for both suites together rather than blocking this slice. The new repository
  spec does assert the concrete `StaleReceiptVersionError` class, which is the right direction.

Checked and clean: the fix commit message matches docs/12; prose checks pass; the new spec
observes only through the repositories, the adapter, and the unit of work, never through raw
Prisma; the migration and adapter findings from the prior pass are unchanged and remain clean;
the diff adds tests and weakens none.

## Verdict

APPROVED
