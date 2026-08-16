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
**Answered in p6b:** `releaseHold` now takes a `ReleaseReason`, so the caller names why the hold is
being released and the adapter writes that as the ledger kind. The alternative, deriving the kind
from the shape of a distribution, would have made the ledger's account of itself depend on how many
recipients a settlement happened to have.
**Previously:** `releaseHold` wrote kind `ORIGINATE_LOAN`, the only release in scope through P5; the
port signature from docs/01 carried no kind parameter
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
flow 6 without a special case. P6a settles the argument with evidence: an integration test carries a
lender from default through the claim into a redemption request, which only works because the
receipt lands `IN_VAULT`. The diagram is the side that needs correcting. The diagram also shows liquidation burning only from `IN_VAULT`,
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

## Q-015: should the payoff quote validity be a protocol parameter
**Blocks:** the payoff quote
**Currently implemented:** a five minute window as a constant beside the query
**Needs:** whoever owns docs/03
**Notes:** docs/10 flow 5 requires a validUntil and a stale rejection but names no duration. The
window trades how long a borrower has to act against how far the charged amount can drift from the
figure on screen, which reads like an operations dial rather than a code constant.

## Q-016: the test clock is shared by every Playwright project
**Blocks:** any further spec that needs to move time
**Currently implemented:** clock moving specs run in their own project that depends on the other
three, so they start only once everything else has finished, and they reset the clock afterwards
**Needs:** whoever owns docs/06
**Notes:** docs/06 asks for a POST /test/clock/advance endpoint and separately forbids shared
mutable fixtures between tests. One api process serves every project, so the offset is exactly such
a fixture: advancing it ages out the listings and offers other specs are working with. Scoping the
offset to a request header would make it per client, at the cost of threading an async local
through the clock adapter.

## Q-017: where redemption status belongs in the marketplace
**Blocks:** nothing; the information is on screen either way
**Currently implemented:** redemption status is a column on `/borrow/receipts` beside the receipt
it belongs to, and there is no `/borrow/redemptions` route
**Needs:** whoever owns docs/05
**Notes:** The route table names `/borrow/redemptions` for requests and their status. A request has
no life of its own away from its receipt, and a borrower looking for an item looks for the item, so
the narrowest reading put the status where the receipt already is. A separate route is worth
building if redemptions grow fields of their own, such as an appointment time.

## Q-018: the code for claiming collateral on a loan that never defaulted
**Blocks:** the claim receipt endpoint
**Currently implemented:** LOAN_NOT_DEFAULTED, a new code registered alongside the others, while a
loan that closed before the claim answers LOAN_NOT_ACTIVE as flow 7 names
**Needs:** whoever owns docs/04
**Notes:** The flow 7 failure table covers the loan repaid before the claim but not the loan that is
still healthy and inside its term. Reusing LOAN_NOT_ACTIVE for a live loan would be false, so the
narrowest reading added a code rather than stretching one. The canonical list in docs/04 does not
carry it yet.

## Q-019: the rounding line and the ledger's positive amount rule
**Blocks:** the liquidation settlement
**Currently implemented:** the waterfall always computes all four lines, including a rounding line
that is usually zero, and the close use case drops the zero valued ones before settling
**Needs:** whoever owns docs/03
**Notes:** docs/03 says the remainder line must never be omitted, while the ledger has forbidden a
non positive entry amount since P1 and enforces it in the entity, in a database trigger, and in a
property test. Reading the two together, never omitted means never forgotten in the arithmetic
rather than always written as an entry: a movement of zero is not a movement, and the four line
calculation is what proves the parts still sum to the whole.

## Q-020: may a sale close before its bidding window ends
**Blocks:** nothing today
**Currently implemented:** operations may close as soon as any bid clears the reserve, and the
closing time only governs whether further bids are accepted
**Needs:** whoever owns docs/10
**Notes:** Flow 8 sets a closesAt when the sale opens and gives no rule about closing early. Letting
operations settle the moment a bid lands undercuts the point of advertising a window to bidders,
while forcing them to wait leaves an item unsold when everyone has finished bidding. The narrowest
reading keeps closesAt governing bids only.

## Q-021: who may read the reason trading stopped
**Blocks:** nothing today
**Currently implemented:** any signed in account can read the pause state, including the free text
reason and the account that pulled the switch
**Needs:** whoever owns docs/10
**Notes:** Flow 11 wants members to know trading is paused rather than guessing why an offer was
refused, which argues for showing the reason. The same field is the audit record of why an operator
stopped the market, and an operator writing an internal note into it would broadcast that note to
every member. Splitting a public message from a private reason would settle it.

## Q-022: how a second api process learns a parameter edit landed
**Blocks:** nothing in Phase 1
**Currently implemented:** the registry holds the versions in memory and reloads after its own
write, so a process that did not handle the PUT keeps serving the previous version until it restarts
**Needs:** whoever owns docs/01
**Notes:** Phase 1 runs one process, so the question is theoretical today. A second replica would
need a poll, a notification, or a read through cache. Effective dates already work without a write,
because the version in force is recomputed from the cached rows on every read; the gap is only the
arrival of a brand new version. Phase 3 removes the question entirely: the parameters live in a
shared Config object every reader sees.

## Q-023: whether outbox delivery must become exactly once before Phase 3
**Blocks:** the chain submission adapter
**Currently implemented:** at least once. A crash between a successful publish and the published_at
write leaves the row claimed, and the claim expires after the visibility window, so the event is
delivered again
**Needs:** whoever owns docs/08
**Notes:** A duplicate log line costs nothing, which is why this is not a Phase 1 defect. A duplicate
chain submission is a different matter. The usual answer is an idempotency key carried into the
submission so the chain itself rejects the second copy, which is closer to how the rest of this
system already works than trying to make the queue exactly once.

## Q-024: whether ordinary development should share the demo clock
**Blocks:** nothing today
**Currently implemented:** `pnpm dev` runs the api in demo mode, so it reads the offset the seed
left in `demo_clock` and starts weeks ahead of the wall clock
**Needs:** whoever owns docs/11
**Notes:** The demo needs this, because the seed and the serving process are two processes and the
loan book only makes sense against the clock it was written under. Ordinary development inherits it
as a side effect: after a seed, a developer's api is dated two months out. That is harmless while
every date on every screen comes from the same clock, and it is what the demo is going to do
anyway, so running development in the same mode is at least honest. The alternative is a third
mode, which is a mode nobody would remember to use. Resetting is one call to the clock route.

## Q-025: where derived image sizes should come from
**Blocks:** nothing today
**Currently implemented:** the original bytes are served as uploaded, under a content hash key, with
an immutable cache header and a size cap of eight megabytes at upload
**Needs:** whoever owns docs/01
**Notes:** A browse row shows a photograph at 56 pixels and is handed whatever the vault staff
uploaded, which on a real phone is several megabytes. Deriving sizes at upload needs a native image
dependency; deriving them on read needs the same dependency plus a cache. Neither is worth carrying
while the bytes live on one machine's disk. The moment they move to a bucket, the bucket's own image
service or a CDN in front of it does this properly, and the key is already a content hash so every
derived size is safely cacheable forever. Until then the cap is what keeps it honest.

## Q-026: whether a borrower may add their own photographs
**Blocks:** nothing today
**Currently implemented:** only vault staff can attach a photograph, and only to an intake they are
recording, before it is sealed
**Needs:** whoever owns docs/00
**Notes:** The photograph is evidence that a named member of staff had the item in their hands on a
given day, which is exactly what makes it worth showing to a lender. A borrower supplied image would
be a different kind of thing wearing the same clothes. If borrowers ever do upload, the two need to
be visibly distinct on screen, not merged into one gallery.

## Q-027: whether the operations consoles should read like the marketplace
**Blocks:** nothing today
**Currently implemented:** the vault console and the admin lead with identifiers and monospace, and
carry no explain layer; only their state names were put into words
**Needs:** whoever owns docs/05
**Notes:** Staff quote receipt ids to each other and read them off labels, so a table that leads
with the id is the right tool for that job rather than a shortcoming. Applying a lender's treatment
to an operations console would be copying a pattern instead of using it. This is written down so
the asymmetry reads as a decision rather than as unfinished work.
