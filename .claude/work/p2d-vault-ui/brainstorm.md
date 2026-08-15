# p2d-vault-ui brainstorm

## What this slice changes

The vault console becomes real: an intake list and start screen, the linear intake wizard
(identify, photograph, appraise, seal, review and issue) driven by the server state of the
intake, an inventory screen with status filtering, and the exposure screen. The marketplace gains
`/borrow/receipts` so the borrower sees the issued receipt. A cross app Playwright test walks
intake to a visible receipt, plus a failure path (sealing without evidence). All screens compose
`packages/ui` primitives against the frozen tokens; the console renders on the terminal surface.

## Files touched

New routes under `apps/vault-console/src/routes/`: `intake.tsx` (start), `intake.$intakeId.tsx`
(wizard), `inventory.tsx`, `exposure.tsx`; helper hooks under `src/`; marketplace
`routes/borrow.receipts.tsx`; `e2e/tests/vault-console.intake.spec.ts`.

Modified: vault console home navigation, marketplace navigation, e2e seed expectations (the demo
vault is already seeded).

## Approaches

The wizard renders the step from the intake's server state rather than local step state, so a
reload resumes exactly where the intake is; the only local state is form drafts, per
docs/05-frontend.md. The single demo vault id is a constant in the console app (Q-003 scope). The
irreversible steps (seal, issue) get a Dialog confirmation stating what becomes immutable.

## What could break

Playwright file upload drives the photo step with `setInputFiles`. The wizard must invalidate the
intake query after each mutation. The `/borrow/receipts` path must not collide with the existing
`/wallet` route tree.

## Ambiguity

The identify step (government id verification) is procedural, not modelled by any endpoint, so
the wizard's first step is the item identification form that `PATCH /intakes/:id` covers; the
audit trail of the operator's session covers who did it.
