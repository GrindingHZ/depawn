# Review: p3a-marketplace-domain (re-review after blocking fixes)

Base dd3f7fb, head ee44422 (`fix(domain): register the draft code and test listing expiry`).
Verified mechanically: `pnpm check` exit 0, `pnpm test:unit` exit 0 (api: 16 files, 61 tests
passing, listing.spec.ts now 9 tests).

## Blocking findings from the prior review

- `LISTING_NOT_DRAFT` registration: closed. `packages/contracts/src/error-codes.ts` line 23 now
  carries the entry, so p3b maps a registered code and the frontend copy map, typed against the
  const, will demand copy for it at compile time. Residual: the illustrative list in
  `docs/04-api-contract.md` (Error codes section, around line 245) still omits `LISTING_NOT_DRAFT`.
  The doc itself names the contracts file as the canonical registry and the type system guards the
  real consumers, so this is demoted to non-blocking; see below.
- `Listing.expire` coverage: closed. The new spec in
  `apps/api/src/domain/marketplace/listing.spec.ts` exercises all three branches: ACTIVE before
  `expiresAt` is rejected, ACTIVE past `expiresAt` transitions to EXPIRED and returns the pending
  offer in `supersededOfferIds`, and DRAFT is rejected. That is the happy path and both rejection
  branches the prior review demanded.

No blocking findings remain.

## Non-blocking

- Add `LISTING_NOT_DRAFT` to the docs/04 error codes list the next time a commit touches
  `docs/04-api-contract.md`, or as a one-line docs commit in p3b. The registry and the doc are
  currently out of sync by exactly this one code.
- The comment in `apps/api/src/domain/marketplace/protocol-parameters.ts` says "Values here are the
  demo defaults from docs/OPEN-QUESTIONS.md Q-001, Q-003, Q-005, and Q-007", but the file exports
  only the interface and a DI symbol; no demo defaults constant exists anywhere in the repo, and the
  two spec files each duplicate the literal values. Either export the documented defaults or reword
  the comment so it stops claiming values the file does not carry.
- `acceptOffer` does not re-check LTV (it takes no appraised value), so the rule M5 re-check at
  origination (flow 4 step 3) rests entirely on the P4 use case calling `assertWithinLoanToValue`
  again. This matches the docs/02 signature, but P4 must not forget it; worth a line in the plan for
  p4.
- `Listing.expire` returns `ListingNotActive` when the listing is ACTIVE but `expiresAt` has not
  passed. The new spec pins this behaviour without questioning it: the code LISTING_NOT_ACTIVE is
  misleading for "not yet expired", and a caller cannot tell the two rejections apart.
- Remaining coverage gaps: the `ListingExpired` rejection on `addOffer` and the `OfferExpired`
  rejection on `acceptOffer` are never exercised, and no `addOffer` test hits the
  LoanToValueExceeded branch through the aggregate (it is covered only at the policy level in
  `loan-to-value-policy.spec.ts`). The protocol-level rate cap branch is also untested since the
  listing cap (2400) is always the lower bound in the fixtures.
- Known deviation, acknowledged: `rank-offers.spec.ts` was staged into feat commit 4bd930c instead
  of its own test commit. Recorded in the plan file; history rewrites are banned, so it stands.

Checked and clean: no infrastructure imports anywhere under `domain/marketplace` (dependency-cruiser
also passes); all expected failures return `Result`; `acceptOffer` is side effect free and returns
the `AcceptedOffer` description with fee split, disbursement, and superseded ids; SUPERSEDED is a
distinct state from WITHDRAWN with the transition table exported for both machines and the offer
table walked exhaustively; ranking uses integer arithmetic on total borrower cost over the listing's
requested duration with `MILLISECONDS_PER_YEAR` at 365 days, ties broken by submission time, never
by principal (M4); M5 through M8 all have homes (M5 `assertWithinLoanToValue`, M6 the withdrawal
lifetime guard, M7 the borrower check in `acceptOffer`, M8 supersession without refund); one error
class per file; the fix commit message is a single line `type(scope): summary`; prose check passes
with no em dashes, curly quotes, or emoji in the new files.

## Verdict

APPROVED
