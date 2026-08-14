# p2a-custody-domain brainstorm

## What this slice changes

The custody domain from `docs/02-domain-model.md`: `Vault`, `Appraisal`, `IntakeRecord` with its
lifecycle (`DRAFT` to `SEALED`), and `CustodyReceipt` upgraded from the P0 readonly shape to an
entity with the explicit transition table (`IN_VAULT`, `ENCUMBERED`, `RELEASED`, `LIQUIDATED`),
plus the pure policies: `assertWithinInsuredLimit` and the canonical intake record hash. Unit
tests walk every `(from, event)` pair of the state machine, prove sealing is irreversible in the
entity, and prove the hash is stable across a serialise and deserialise round trip. No
persistence, endpoints, or UI; those are p2b to p2d.

## Files touched

New under `apps/api/src/domain/custody/`: `vault.ts`, `appraisal.ts`, `intake-record.ts`,
`intake-record-hash.ts` (pure canonicalisation and sha256 over injected bytes? hashing is pure
given the canonical string; the sha256 stays in the domain since it is a pure function of its
input), `vault-exposure-policy.ts`, `receipt-errors.ts` split per error file, and the rewritten
`custody-receipt.ts` with specs beside each.

Modified: `domain/shared/identifiers.ts` (IntakeId, AppraisalId), `custody.port.ts` if the entity
shape changes field names (it should not).

## Approaches

State machine: an explicit `allowedTransitions` table plus guard methods returning `Result`, as
docs/02 prescribes; the table is exported so the exhaustive spec walks it as data. Hashing:
`node:crypto` sha256 inside the domain is a pure computation, not ambient state, and the purity
lint bans only time, randomness, and environment; the alternative (a hashing port) adds a seam
the chain migration does not need because Phase 3 keeps hashing off chain.

## What could break

The P0 `CustodyReceipt` interface is consumed by `custody.port.ts`; converting it to a class with
the same readonly fields keeps the port source compatible. Dual appraisal enters as a pure policy
(`requiresDualAppraisal`) driven by a threshold parameter, defaulted high per Q-005.

## Ambiguity

`ProtocolParameters` from docs/01 does not exist yet; this slice introduces the subset it needs
(`dualAppraisalThresholdMinorUnits` alongside the insured limit argument) as plain arguments to
pure policies, and the full parameters object lands with the marketplace phase where the LTV
table lives. Nothing else is undecidable.
