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

## Q-009: commit scope for the test support package
**Blocks:** commit messages touching `packages/test-support`
**Currently implemented:** the scope `test-support` is used, since the docs/12 scope list predates
the package and lists no fitting scope; the commit hook accepts any lowercase scope
**Needs:** whoever owns docs/12
**Notes:** Either `test-support` joins the list or those commits fold under an existing scope.

## Q-010: ledger transaction kind for hold releases
**Blocks:** the `SETTLE_LIQUIDATION` entry shape in P6
**Currently implemented:** `SettlementPort.releaseHold` writes kind `ORIGINATE_LOAN`, the only
release in scope through P5; the port signature from docs/01 carries no kind parameter
**Needs:** whoever owns docs/01 and docs/03
**Notes:** When liquidation bidding reuses holds, either the port gains a kind, the adapter
derives it from the distribution shape, or bids get their own port method.

## Q-011: whose account does POST /me/deposits credit
**Blocks:** the wallet slice and the admin deposit tool
**Currently implemented:** the operations caller posts `{ email, amount }` and the deposit lands
on the named account, defaulting to the caller's own account when the email is omitted
**Needs:** whoever owns docs/04
**Notes:** docs/04 restricts the endpoint to operations while docs/05 gives the admin app a tool
that funds other members; a literal reading of the `/me` path could only fund the operations
account itself.

## Q-012: receipt state after a default claim
**Blocks:** the custody receipt transition table
**Currently implemented:** `claimDefault` moves the receipt to `IN_VAULT` under the claimant per
docs/10 flow 7, and `burnForLiquidation` is reachable from both `IN_VAULT` and `ENCUMBERED`
**Needs:** whoever owns docs/02
**Notes:** The docs/02 diagram keeps the claimed receipt `ENCUMBERED` with a holder change, while
flow 7 says the claimant holds it `IN_VAULT`; the flow reading lets the claimant redeem through
flow 6 without a special case. The diagram also shows liquidation burning only from `IN_VAULT`,
but flow 8 can run before any lender claim.

## Q-013: pause check inside origination before P7
**Blocks:** the accept offer use case
**Currently implemented:** origination does not consult a pause state because none exists before
P7 builds the pause switch and its never-block-exit tests
**Needs:** whoever owns docs/10
**Notes:** Flow 4 step 4 asserts the system is not paused. The narrowest reading defers the
assertion to the P7 slice that introduces the pause state, which must then add it to every
blocked entry point listed in docs/10 in one pass.

## Q-014: badge tone for an active loan past the end of grace
**Blocks:** the loan status badge in the marketplace
**Currently implemented:** any ACTIVE loan past maturity reads warning and is labelled
PAST MATURITY, whether or not grace has ended
**Needs:** whoever owns docs/DESIGN-BRIEF.md
**Notes:** The brief gives warning to a loan that is past maturity and in grace, and danger to a
loan that is DEFAULTED. A loan that has run past the end of grace while no note holder has marked
it defaulted falls between the two cells, and calling it in grace on screen would be false.
