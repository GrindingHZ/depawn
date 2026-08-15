# p2d-vault-ui review

Diff base 6aff395, five commits reviewed. Mechanical gates: pnpm check exit 0,
pnpm test:unit exit 0, scripts/check-design-tokens.sh exit 0. No raw colour,
font, or pixel spacing outside tokens; every StatusBadge carries its state name
as text per docs/DESIGN-BRIEF.md; brainstorm and plan contain no banned skill
query; Playwright uses getByRole and getByTestId only, no waitForTimeout, no
CSS selectors; all five commit messages match docs/12; no em dashes, curly
quotes, emoji, or banned phrases in the new files. Server state is all in
TanStack Query, no useEffect fetching, wizard steps are one component per file
and every component is under 150 lines.

## Blocking

- none

## Non-blocking

- e2e/tests/vault-console.intake.spec.ts:95 the test named "sealing without
  evidence shows the rejection" never seals and never shows a rejection; it
  asserts the photograph continue button is disabled, which matches the slice's
  stated failure path but not the test name. The comment at line 108 is garbled
  and describes behaviour the test does not exercise. Rename the test to what
  it proves, or extend it to drive the seal step and assert the
  INTAKE_INCOMPLETE alert.
- apps/vault-console/src/routes/intake.$intakeId.tsx:54 the comment says a
  reload resumes where the server state says the intake is, but only SEALED
  maps to the issue step; a DRAFT intake that already has evidence and
  appraisals reloads at identify. Deriving the index from the evidence and
  appraisal arrays would make the resume claim true.
- apps/vault-console/src/intake-steps/issue-step.tsx:35 issuing invalidates
  ['intakes'] and the exposure key but not the inventory queries keyed
  ['inventory', status], which are stale after a receipt is issued; the default
  refetch on mount masks it. Related: intake-keys.ts groups inventory and
  exposure keys under the intakeKeys factory but outside its 'intakes'
  namespace, so intakeKeys.all cannot reach them.
- apps/vault-console/src/receipt-status-tone.ts and
  apps/marketplace/src/receipt-status-tone.ts are identical copies of the
  DESIGN-BRIEF receipt mapping; docs/05 says promote to packages/ui once a
  second app needs it, and two copies of a status mapping can drift.
- apps/vault-console/src/intake-steps/photograph-step.tsx:14 the upload
  mutation passes no idempotency key, and seal-step.tsx:33 generates an ad hoc
  key at submit time for the embedded patchIntake call; docs/05 wants every
  mutation hook to carry a key generated on mount. The seal action also chains
  two API calls in one mutation, so a failed seal still persists the seal
  number, which is acceptable for a draft field but worth knowing.
- No @axe-core/playwright checks exist anywhere in e2e, while docs/05 and
  docs/13 require them on each primary route. The gap predates this slice, but
  the vault console's primary routes now exist without the check.

## Verdict

APPROVED
