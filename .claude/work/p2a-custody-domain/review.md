# Review: p2a-custody-domain

Base 41b4487, head 0537136 (re-review after blocking fix be962d7 and follow-up
0537136). Verified: pnpm check exit 0, pnpm test:unit exit 0, and an uncached
run of the api suite via turbo --force (13 files, 47 tests, all passed).

## Blocking

None.

## Resolved since the prior review

- The localeCompare sort in
  apps/api/src/domain/custody/intake-record-hash.ts is replaced by a plain
  code unit comparison on the composed label:contentHash key, with a comment
  stating why localeCompare is forbidden there. The evidence sort now matches
  the deterministic default sort already used for serialNumbers, so the
  canonical form no longer depends on the process locale or ICU build.
- The custody error codes INTAKE_ALREADY_SEALED, INTAKE_INCOMPLETE, and
  RECEIPT_NOT_ENCUMBERED are registered in
  packages/contracts/src/error-codes.ts ahead of the p2c endpoints.
- The comment in apps/api/src/domain/custody/dual-appraisal-policy.ts now
  describes the threshold as a caller-supplied protocol parameter, with the
  Q-005 default living in configuration rather than in this function.

## Non-blocking

- The hash round-trip spec still runs in a single process, so it could not
  have caught the locale bug and cannot prove cross-machine stability. When
  convenient, pin the hash of a fixture with mixed-case and non-ASCII labels
  as a string literal to freeze the canonical form against future edits.

## Notes on the divergence checks

- The transition table implements the docs/10 flow 7 reading: claimDefault
  lands in IN_VAULT under the claimant, and burnForLiquidation is reachable
  from IN_VAULT and ENCUMBERED. Both divergences from the docs/02 diagram are
  recorded as Q-012 in docs/OPEN-QUESTIONS.md, and the flow 7 step 3 text
  (claimant redeems via flow 6) supports the implemented reading.
- Invariant homes: C2 via the single appraisal snapshot on CustodyReceipt, C3
  via the transition table (no transferHolder, burnForRedemption, or listing
  moves from ENCUMBERED), C4's domain half via burnForRedemption to RELEASED
  with the release process deferred to the use case, C5 via
  assertWithinInsuredLimit with at-limit accepted and one-unit-over rejected.
  C1 is use case scope for p2c as planned.
- Expected failures return Result; the ENCUMBERED and encumberedByLoanId
  agreement check throws on restore as a programmer error, with a spec.
- No infrastructure, NestJS, Prisma, or ambient time, randomness, or env in
  the domain; node:crypto sha256 is a pure computation. check-boundaries and
  check-prose pass.
- All ten commit messages are one line, allowed type and scope, imperative,
  under 72 characters, including the two fix commits.
- Specs cover the full state and event product against the exported table,
  terminal states, seal irreversibility across all four mutators, dual
  appraisal boundary at and below threshold, distinct appraiser rejection,
  hash round trip and order independence, and exposure below, at, and one
  unit past the limit.

## Verdict

APPROVED
