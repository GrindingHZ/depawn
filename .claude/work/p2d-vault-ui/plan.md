# p2d-vault-ui plan

## Tasks

- [ ] feat(vault-console): add the intake wizard against real endpoints
- [ ] feat(vault-console): add inventory and exposure screens
- [ ] feat(marketplace-ui): add borrower receipts screen
- [ ] test(e2e): run intake to a receipt the borrower can see

## Design pass

- Intake wizard: composes AppShell (terminal surface), Stepper, Card, Field, Button, Dialog for
  the seal and issue confirmations. Status tokens: status-active for the current step,
  status-success for completed steps, status-danger for rejection alerts. States: skeleton while
  the intake loads, role="alert" copy keyed off error codes, no empty state (a wizard always has
  an intake).
- Intake start: AppShell, Card, Field, Button; skeleton and alert states.
- Inventory: AppShell, DataTable, StatusBadge with the receipt state mapping from
  docs/DESIGN-BRIEF.md (IN_VAULT active, ENCUMBERED warning, RELEASED neutral, LIQUIDATED
  danger), Select filter, EmptyState, Skeleton.
- Exposure: AppShell, Card, Money; the remaining figure uses status-warning text when exposure
  is above four fifths of the limit; skeleton and alert states.
- Borrower receipts: AppShell, DataTable, Money, StatusBadge (same mapping), EmptyState,
  Skeleton.
