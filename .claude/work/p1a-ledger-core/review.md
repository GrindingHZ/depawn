# Review: p1a-ledger-core

Reviewed diff 2e2445d..be160fd, eight commits. Verified against docs/01, docs/03, docs/06,
docs/09, docs/12, and the slice brainstorm.

Mechanical verification: pnpm check exit 0 (typecheck, lint, prettier, boundaries, prose,
tokens all green; dependency-cruiser reports no violations). pnpm test:unit exit 0
(api 32 tests, ui 27 tests, including the five ledger-transaction property tests).
test:integration not run per review instructions; the integration specs were read instead.

Spot checks that passed:

- Entry shapes match the docs/03 table: HOLD_FUNDS, REFUND_HOLD, ORIGINATE_LOAN via
  distribution with the fee sentinel, DEPOSIT, WITHDRAW, REPAY_LOAN. SETTLE_LIQUIDATION is
  correctly out of scope until the waterfall lands.
- minor_units always positive with direction carrying the sign, enforced in build, by the
  new CHECK constraint, and by the property test generator.
- Balances derived by SUM over ledger_entry, never stored. No balance column anywhere.
- LedgerSettlementAdapter matches the SettlementPort signatures from docs/01 exactly,
  including availableBalance taking no unit of work context.
- Money is bigint minor units plus branded currency throughout; no number, no float.
- Domain files in apps/api/src/domain/ledger import only domain shared modules; the
  boundaries check confirms.
- The contract suite contains exactly the six tests named in docs/06 layer 3 and takes a
  subject factory, so the Sui adapter can reuse it unchanged.
- Every money-moving integration spec ends at the toSumToZero matcher: the contract spec
  through a global afterEach, the concurrency spec inside every round, the harness spec
  inline. Assertions are numeric balance checks against real Postgres state, not shape
  checks.
- The concurrency spec races two holds across 20 rounds and requires exactly one winner
  and a zero remaining balance, matching the docs/06 concurrency requirement.
- Hold and transfer take a FOR UPDATE row lock on the ledger account before reading the
  balance, the serialisation docs/03 requires. The float exemption from the balance check
  cites business rule $2 correctly.
- Comments explain why (three-layer invariant, sentinel rationale, lock rationale,
  hardcoded release kind); none restate code. No em dashes, curly quotes, emoji, or
  banned phrases in any new file.
- All eight commit messages are one line, imperative, lowercase, under 72 characters,
  valid types, no trailers.
- The harness test change is a strengthening, not a weakening. The old test fabricated an
  unbalanced ledger to show the matcher catches it. The new trigger makes that state
  unreachable through the database, and the test now asserts the trigger rejection plus
  the matcher on the balanced remainder, which proves a stronger system property: the
  invariant is enforced at commit, not merely detectable afterwards.

## Blocking

- none

## Non-blocking

- The toSumToZero matcher's failure branch is now untested. Since the trigger blocks every
  unbalanced insert, no test can make the matcher fail, so a regression that turned the
  matcher into a no-op would go unnoticed while every suite keeps trusting it as the
  safety net. Consider a harness test that disables the trigger (ALTER TABLE ledger_entry
  DISABLE TRIGGER ledger_transaction_balanced), inserts an unbalanced entry, asserts the
  matcher rejects, then re-enables.
- releaseHold's exactly-once path (second call returning the existing settlement ref via
  refOfExisting) has no test; the contract suite covers refund idempotency only. The code
  path is symmetrical but unexercised.
- packages/test-support depends on @depawn/api by deep source path while apps/api dev
  depends on test-support; turbo warns about the circular package dependency on every run.
  The brainstorm chose the deep import deliberately to avoid type drift, but the cycle
  will bite task ordering or caching eventually. Extracting the port types to a leaf
  package would break it.
- LedgerAccountDirectory.findOrCreate has a first-use race: two concurrent transactions
  for a brand new (owner, purpose, currency) both pass findFirst and one fails on the
  unique constraint with a raw Prisma error instead of a retry or upsert. Money stays safe
  because the transaction rolls back, and the concurrency spec deliberately warms accounts
  to avoid it, which also means it is untested.
- Commit scope test-support is not in the docs/12 scope list. The commit hook accepts any
  lowercase scope so it passes mechanically, but docs/12 says scopes are drawn from the
  list, nothing invented. Either add test-support to the list or fold the commit under
  chore(deps) style scoping.
- The hardcoded ORIGINATE_LOAN kind in releaseHold is acknowledged only in a code comment.
  CLAUDE.md routes ambiguity to docs/OPEN-QUESTIONS.md; a Q entry noting the port carries
  no kind and how liquidation-era holds will disambiguate would fit the working agreement.
- The balance trigger fires on INSERT only. The ledger is append-only by doctrine, but an
  UPDATE or DELETE on ledger_entry would escape the balance check. A trigger on all three
  statements, or a rule forbidding UPDATE and DELETE, would close it.

## Verdict

APPROVED
