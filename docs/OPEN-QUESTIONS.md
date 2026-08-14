# Open Questions

Append here rather than guessing. Each entry: the question, why it blocks, the narrow reading
currently implemented, and who can resolve it.

Format:

```
## Q-00N: short title
**Blocks:** slice or flow
**Currently implemented:** the narrowest reading
**Needs:** who decides
**Notes:**
```

---

## Q-001: jurisdiction for the demo
**Blocks:** statutory holding period, rate caps, surplus return, police reporting fields
**Currently implemented:** parameters are configurable with placeholder values; holding period 30 days,
maximum rate 4800 basis points, surplus always returned
**Needs:** founder, then a lawyer in the target jurisdiction
**Notes:** Pawnbroking is licensed per state or province in most countries, with per-facility licences
and prescribed record-keeping. The intake record schema may need mandated fields we have not modelled.

## Q-002: is the lender note a financial product
**Blocks:** whether note transfer ships enabled, and whether retail lenders can participate at all
**Currently implemented:** notes are minted, the transfer endpoint exists, the `notesTransferable`
feature flag is off
**Needs:** securities counsel
**Notes:** A transferable, yield-bearing claim on a loan is close to the definition of a security in
most regimes. This is the single largest legal question in the design.

## Q-003: item categories for the demo
**Blocks:** LTV table, appraisal workflow, authentication steps in the intake wizard
**Currently implemented:** `BULLION` only, LTV cap 6000 basis points
**Needs:** founder
**Notes:** Bullion is assayable, publicly priced, and liquid, which makes appraisal near-objective.
Watches and jewellery introduce authentication risk. Art is a different business.

## Q-004: deposit and withdrawal in Phase 1
**Blocks:** the wallet screen and the demo script
**Currently implemented:** operations-only admin deposit; no payment rail
**Needs:** founder
**Notes:** A real rail (card, bank transfer) adds PCI and reconciliation scope for no demo benefit,
and is thrown away at Phase 3 anyway.

## Q-005: dual appraisal threshold
**Blocks:** the intake wizard branch
**Currently implemented:** a configurable threshold, defaulted high enough that the demo path is
single-appraisal
**Needs:** operations policy

## Q-006: who takes physical delivery after liquidation
**Blocks:** the final step of Flow 8
**Currently implemented:** the winning bidder receives a newly issued receipt for the same item
**Needs:** founder
**Notes:** The alternative is that we ship it, which introduces logistics, insurance in transit, and
a delivery-dispute flow.

## Q-007: minimum offer lifetime
**Blocks:** rule M6
**Currently implemented:** 10 minutes
**Needs:** founder
**Notes:** Too short and a lender can bait a borrower then withdraw mid-acceptance. Too long and
lenders will not commit capital.

## Q-008: error codes missing from the contract table
**Blocks:** validation responses, duplicate registration, generic faults
**Currently implemented:** `VALIDATION_FAILED` (400), `EMAIL_ALREADY_REGISTERED` (409), and
`FAULT` (500) added to `packages/contracts/src/error-codes.ts`, since `docs/04-api-contract.md`
requires a stable code on every error envelope but lists none for these cases
**Needs:** whoever owns the API contract
**Notes:** The docs list also omits codes for rate limiting; add one when a limiter exists.
