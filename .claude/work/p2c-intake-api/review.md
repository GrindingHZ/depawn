# Review: p2c-intake-api

Base f29dd79, 9 commits, re-reviewed 2026-08-15 after the blocking fix (83d025f).

Mechanical results: pnpm check exit 0 (typecheck, lint, prettier, boundaries, prose,
tokens), pnpm test:unit exit 0 (api 47 passed, ui 31 passed). Fix commit message matches
type(scope): summary, one line, no body. Implementer reports both custody integration
specs green (6/6) including the new same-intake race spec.

## Blocking finding: resolved

The prior blocker was concurrent duplicate issuance for the same intake: the idempotent
replay check ran before vaults.lock and custody_receipt.intake_record_hash had no unique
constraint, so two racing calls could both insert. Commit 83d025f closes it on three
layers, verified by reading the diff and the resulting files:

- Ordering. In issue-receipt.use-case.ts the FOR UPDATE vault lock (prisma-vault
  repository, SELECT id FROM vault WHERE id = $1 FOR UPDATE) now precedes both the
  replay check and the exposure read, all inside the single unitOfWork.run. Under READ
  COMMITTED the loser blocks on the row lock until the winner commits; its next
  statement takes a fresh snapshot, findByIntakeRecordHash sees the committed receipt,
  and the loser replays it instead of inserting. Same intake implies same vault, so the
  two racers always contend on the same lock row. The comment explains the why.
- Backstop. Hand-authored migration 20260815170000_receipt_intake_hash_unique creates
  CREATE UNIQUE INDEX "custody_receipt_intake_record_hash_key" on
  custody_receipt(intake_record_hash) with a comment naming rule C2. Any future code
  path that skips the vault lock fails at the database instead of duplicating. The
  index name matches what Prisma derives for the new @unique in schema.prisma, so no
  drift. Prior applied migrations were not edited.
- Proof. issue-receipt-race.integration.spec.ts gains a 20-round same-intake race:
  Promise.allSettled on two concurrent executes, asserting at least one fulfilled
  success, all fulfilled successes share one receipt id, and exactly one
  custody_receipt row exists per round. The prior two-intake exposure race spec is
  unchanged.

## Non-blocking (carried forward)

- apps/api/src/infrastructure/storage/filesystem-object-storage.adapter.ts guards
  traversal with resolved.startsWith(resolvedRoot) without a trailing separator, so a
  key resolving to a sibling directory whose name extends the root name (var/storage
  versus var/storage-x) passes the guard. Unreachable today because keys are built from
  a verified intake id and a hex digest, but compare against root plus path.sep.
- docs/10-flows.md flow 1 says a repeat issuance is "409, idempotent replay returns the
  original"; the implementation returns 201 with the original receipt for any repeat.
  Also POST /intakes/:id/photos does not appear in docs/04-api-contract.md (which puts
  evidence under PATCH /intakes/:id), and neither doc was updated in this slice
  (definition of done step 8).
- GET /vaults/:vaultId/inventory returns 200 with an empty list for a vault that does
  not exist while GET /vaults/:vaultId/exposure returns 404 for the same id; the two
  vault reads should agree.
- In attach-photo.use-case.ts the storage.put call sits inside the unit of work but is
  not transactional; a rollback after the write leaves an orphan file. Content-addressed
  keys make this harmless, but it deserves a comment or a cleanup note.

## Verdict

APPROVED
