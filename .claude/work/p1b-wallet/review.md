# p1b-wallet review (re-review after blocking fix)

Head d89e391, four fix commits reviewed on top of the previously reviewed slice. pnpm check
exit 0. pnpm test:unit exit 0 (32 api, 31 ui, includes the new money-input specs). Integration
not rerun here; the implementer reports 31/31 green and the new race spec was read and asserts
real behaviour.

## Blocking finding: resolved

The interceptor now claims the key before the handler runs. `IdempotencyStore` gained
claim/complete/release (apps/api/src/domain/ports/idempotency-store.port.ts);
`PrismaIdempotencyStore.claim` reserves the row with INSERT ON CONFLICT DO NOTHING and a pending
status code of 0, and the interceptor
(apps/api/src/modules/shared/http/idempotency.interceptor.ts) maps the claim outcomes: claimed
executes, in-progress and mismatch 409, completed replays the stored response.

Verified against the two failure modes from the prior review:

- Same-key race: only one insert wins; the loser reads the pending row and gets `in-progress`,
  a 409, without executing. The new integration test
  (apps/api/test/wallet.integration.spec.ts, "moves money once when the same key races itself")
  fires two deposits with Promise.all and asserts statuses [201, 409] and exactly one DEPOSIT
  ledger transaction.
- Crash window: money commits inside the use case's unit of work, `complete` runs afterwards. A
  crash between the two leaves the row pending, so every retry within the 24 hour window gets a
  409 rather than re-executing. The interceptor comment states this trade (a stuck key over a
  double execution) explicitly, which is the right priority for a ledger.
- Handler failure: `catchError` releases the key, and because the use case is a single
  transaction the money rolled back, so freeing the key for retry is correct.

Two residual hazards, noted honestly, both far narrower than the original finding and
non-blocking:

- The `catchError` in `executeAndComplete` sits downstream of the `complete` call, so a database
  error on `complete` itself, after the money transaction committed, releases the key and a
  retry would re-execute. The window is one UPDATE against a database that just committed
  successfully. A process crash during `complete` is safe (the row stays pending); only a thrown
  non-crash error hits this. A follow-up could scope the release to handler errors only, or move
  the record write into the unit of work.
- Expired pending rows are deleted and reclaimed, so a retry more than 24 hours after a
  crashed-after-commit request would re-execute. This is inherent to any bounded replay window
  and matches the documented 24 hour semantics.

Minor: `claim` retries itself recursively when it loses to an expired row being deleted. The
recursion is bounded in practice (each pass either claims or observes a live row) but has no
depth guard; not worth blocking on.

## Previous non-blocking findings: status

- Resolved: `positiveMoneySchema` now pins `currency: z.literal('AUD')`
  (packages/contracts/src/money.ts), closing the phantom-currency deposit.
- Resolved: `toMinorUnits` moved to packages/ui/src/money-input.ts with edge case specs
  (money-input.spec.ts); both apps import it and the duplicates are gone.
- Resolved: the admin deposit form omits a blank email (apps/admin/src/routes/deposits.tsx
  spreads the field only when non-empty), making the Q-011 default-to-self branch reachable.
- Resolved: docs/10-flows.md gained Flow 12 covering wallet deposit and withdrawal with failure
  modes.

## Non-blocking (carried forward)

- apps/api/prisma/schema.prisma still keeps `@default("")` on `requestHash`. Every writer
  populates it, so drop the default in a follow-up migration; an empty-hash row can only produce
  a spurious 409 on replay.
- The wallet and deposit forms use useState rather than React Hook Form with the contracts Zod
  resolver as docs/05 specifies. The existing login forms share the deviation, so it is
  codebase-wide rather than new to this slice.
- The interceptor and use cases are still exercised only through integration, with no unit
  specs. The extracted money-input helper now has unit coverage, which was the main gap; the
  claim outcome mapping in the interceptor would be cheap to unit test with an in-memory store
  if one is added later.

## Verdict

APPROVED
