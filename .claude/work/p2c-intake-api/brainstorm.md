# p2c-intake-api brainstorm

## What this slice changes

The intake flow from `docs/10-flows.md` flow 1 becomes HTTP: begin intake, patch the draft,
upload photos, record appraisals, seal, issue the receipt, plus the vault inventory and exposure
reads and the member receipt reads. Three pieces of plumbing arrive with it because this is the
first slice that needs them: an `ObjectStoragePort` with a filesystem adapter (photos land under
a gitignored storage directory, hashed with sha256 into the evidence list), an `AuditPort` with a
Prisma adapter writing `audit_log` rows inside the same transaction (docs/09: never skip the
audit log on a state transition), and the outbox implementation of `DomainEventPublisher` so
`ReceiptIssued` is a real event. Issue receipt locks the vault row, checks rule C5 through
`assertWithinInsuredLimit`, and a race test proves two concurrent issuances cannot both slip
under the limit. UI is p2d.

## Files touched

New: custody schemas and client in `packages/contracts`; `domain/ports/object-storage.port.ts`
and `audit.port.ts`; filesystem storage adapter, Prisma audit adapter, outbox publisher;
`modules/custody/` (use cases, queries port implementation, vault and member controllers,
module); integration specs. Seed gains a demo vault.

Modified: contracts index, `app.module.ts`, `seed.ts`, configuration (storage directory).

## Approaches

Photos upload as multipart through a dedicated endpoint that stores bytes behind the port and
appends `{ label, contentHash }` to the intake evidence in one transaction; MinIO stays a swap of
the adapter, which is the entire point of the port. The insurance policy reference arrives in the
issue request body since docs/00 calls it a recorded field. Authorisation: `VAULT_STAFF` role at
the controller per docs/08 (one guard at the boundary becomes one capability parameter).

## What could break

Multipart handling needs multer; the file interceptor stays in the http layer and hands bytes to
the use case. The exposure check must run after the vault row lock or two issuances race past the
limit; the p2b review flagged this proof as blocking for this slice. Audit rows need an actor,
which the controllers pass from the session account.

## Ambiguity

`PATCH /intakes/:id` covers description, serials, and seal number in one partial update; evidence
arrives only through the photo endpoint so every evidence hash is real. The staff id for
appraisals and audit entries is the authenticated account id, since staff identities are accounts
with the `VAULT_STAFF` role and no separate staff registry exists in the docs.
