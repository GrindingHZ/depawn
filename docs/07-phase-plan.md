# 07: Phase plan

## Build order: vertical slices, after a horizontal spine

You asked whether to build backend first or backend and frontend together. Neither pure option is
right, and the distinction matters enough to be explicit about.

**Backend-first fails** because an API with no consumer is an API with no feedback. You will design
endpoints nobody needs, discover missing fields three weeks later, and spend the whole time unable to
demo anything. **Frontend-first fails** because you build against mocks and then discover the real
shape of the data.

**Build a horizontal spine once, then vertical slices forever.**

The spine (P0) is the cross-cutting scaffolding that every slice needs and that nobody wants to
retrofit: monorepo, database, migrations, auth, error model, the ledger primitive, the test harness,
CI. It is genuinely horizontal, it is done once, and it should take days rather than weeks.

Everything after that is a vertical slice: one user-visible capability, taken all the way from domain
entity to Playwright test before the next one starts. A slice that is 80% done in five places is 0%
done.

Within a slice the ordering is: domain and its unit tests, then persistence, then use case, then HTTP
endpoint and its integration test, then UI, then the Playwright test. Roughly a day per small slice
once the spine exists.

---

## P0: spine

**Goal:** an authenticated user can log in to all three apps, see an empty page, and one trivial
end-to-end path works.

- pnpm workspaces, Turborepo, TypeScript strict, ESLint with boundary rules, Prettier
- Docker Compose: Postgres, and later MinIO for intake photos
- Prisma with the initial migration: `account`, `session`, `ledger_account`, `ledger_entry`,
  `ledger_transaction`, `outbox_event`, `idempotency_record`, `audit_log`
- `Money`, `Instant`, branded ids, `Result`, `DomainError`
- Ports defined as interfaces with no implementations yet except `ClockPort`
- `PrismaUnitOfWork`, global error filter, request logging with a correlation id
- Auth: register, login, logout, session cookie, role guard
- The three Vite apps with routing, the shell from `packages/ui`, and a login screen
- Test harness: Testcontainers Postgres, `createTestApplication`, `FixedClockAdapter`,
  truncate-between-tests, the `toSumToZero` matcher, Playwright config with the three projects
- CI running everything

**Exit criteria:** `pnpm check` and `pnpm test` are green; a Playwright test logs in to each app;
the boundary lint rule fails a deliberate domain-imports-Prisma commit.

---

## P0.5: design system

**Goal:** one frozen token set and a primitive library, before any product UI exists.

- Install the UI UX Pro Max skill and run the generator three times, once per app surface
- Reconcile to a single colour ramp, two font families, one spacing scale
- Write `packages/ui/src/tokens.css` and the shared Tailwind preset
- Build the primitives: Button, Field, Select, Checkbox, DataTable, Money, Rate, StatusBadge, Card,
  Dialog, Toast, Skeleton, EmptyState, Stepper, AppShell
- Map every domain status group to a semantic status token, exhaustively
- Write `docs/DESIGN-BRIEF.md`
- Wire `scripts/check-design-tokens.sh` into `pnpm check`
- Record contrast ratios for every text on background token pair

Full detail in `docs/13-design-system.md`, including why the generator runs once and never again.

**Exit criteria:** all three apps consume the preset; the token check passes; a deliberately added
`bg-[#ff0000]` fails `pnpm check`; every primitive has a unit test and appears in the gallery route.

This phase produces no product behaviour and is not optional. Skipping it means every UI slice makes
its own colour decisions and the three apps stop looking like one product by roughly slice nine.

## P1: wallet and ledger

**Goal:** money exists and moves correctly, with nothing to spend it on yet.

- `LedgerAccount`, `LedgerTransaction`, `LedgerEntry` domain entities with the balance invariant
- `LedgerSettlementAdapter` implementing `SettlementPort` in full, including hold, release, refund
- The `SettlementPort` contract suite, running green against the ledger adapter
- Property tests on balance and waterfall
- Endpoints: `GET /me/balance`, `GET /me/ledger-entries`, `POST /me/deposits` (operations only),
  `POST /me/withdrawals`
- Marketplace `/wallet` screen; admin deposit tool
- Concurrency test: two concurrent holds against a balance sufficient for one

**Exit criteria:** the contract suite passes; the concurrency test passes twenty consecutive runs;
the ledger sums to zero after every integration test.

This phase is deliberately early. Every later slice depends on it and every later bug that looks like
a marketplace bug will turn out to be a ledger bug.

---

## P2: custody and the vault console

**Goal:** an item can be taken in, appraised, sealed, and turned into a receipt.

- `Vault`, `Appraisal`, `IntakeRecord`, `CustodyReceipt` with its state machine
- `DatabaseCustodyAdapter` implementing `CustodyPort`; `CustodyPort` contract suite
- Vault exposure policy against the insured limit
- Photo upload to object storage; intake record hashing and sealing
- Endpoints: the full `/vaults`, `/intakes`, `/receipts` set
- Vault console: intake wizard, inventory, exposure screen
- Marketplace: `/borrow/receipts`

**Exit criteria:** a receipt can only be issued from a sealed intake; sealing is irreversible and
tested; exposure limits reject an over-limit intake; the intake hash is stable across a serialise and
deserialise round trip.

---

## P3: listings and offers

**Goal:** a borrower lists a receipt and lenders compete on rate.

- `Listing` and `Offer` entities, ranking function, LTV policy
- Funds held at offer time via `SettlementPort.hold`
- Offer withdrawal with the minimum-lifetime rule
- Endpoints: listings CRUD, publish, cancel, offers, withdraw, reclaim
- Marketplace: browse, listing detail with the offer book, create listing, place offer,
  my listings, my offers with the reclaim banner

**Exit criteria:** an offer above the LTV cap is rejected at both the API and the UI; withdrawing
within the minimum lifetime is rejected; held funds are genuinely unavailable, proven by a test that
tries to place a second offer with them.

---

## P4: origination

**Goal:** the single most important transaction in the product.

- `Loan`, `LenderNote`, `BorrowerNote`
- `AcceptOfferUseCase`: one transaction that validates, re-checks LTV, releases the winning hold into
  a distribution, encumbers the receipt, creates the loan, mints both notes, supersedes the losing
  offers, and emits `LoanOriginated`
- Origination fee split to the platform account
- Marketplace: accept flow, loan detail for both sides

**Exit criteria:** the concurrency test proves exactly one loan from two racing acceptances; the
idempotency test proves exactly one loan from a duplicate request; losing offers end `SUPERSEDED`
with their holds intact; the ledger balances.

This is the slice to over-test. Everything downstream assumes it is correct.

---

## P5: servicing and repayment

**Goal:** loans accrue, get repaid, and items get redeemed.

- Interest calculator wired into `Loan.calculateAmountDue`
- Payoff quote with `validUntil` and stale-quote rejection
- `RepayLoanUseCase`: pay the current note holder, release the encumbrance, return the receipt
- Redemption: request (burns the receipt), staff verification, staff release confirmation
- Marketplace: payoff and repay screens, redemption status
- Vault console: releases queue, two-step verify and release

**Exit criteria:** the full lifecycle API flow test passes; a stale quote is rejected; a receipt
cannot be redeemed while encumbered; double repayment under concurrency produces one repayment.

---

## P6: default and liquidation

**Goal:** the unhappy path is as complete as the happy one.

- `markDefaulted` gated on maturity plus grace
- `claimReceipt` transferring the receipt to the note holder
- `Liquidation` with the statutory holding period gate, reserve price, bidding, close
- Waterfall distribution with surplus to the borrower and the rounding remainder
- Marketplace: lender default and claim actions
- Admin: liquidation management

**Exit criteria:** the four failure-path flow tests pass (claim and redeem, liquidate at a surplus,
liquidate at a loss, liquidate at exactly the amount owed); holding period rejection is tested;
proceeds always sum exactly.

---

## P7: operations, reconciliation, audit

**Goal:** the product is defensible to an operator, an auditor, and a lender.

- Audit log written for every state transition with actor, subject, before, after
- Reconciliation job: physical inventory count against database receipts, per vault, with drift rows
- Admin loan book: outstanding, overdue, at-risk, exposure by vault
- Protocol parameters editable with an effective date and full history
- Pause and unpause, with the exit-path exclusions of rule S2
- Outbox drain worker with retry and a dead-letter table

**Exit criteria:** pausing blocks origination and does not block repayment, redemption, reclaim, or
default claim, each asserted separately; a deliberately corrupted receipt row shows up as drift.

---

## P8: demo hardening

**Goal:** it can be shown to someone without a script of apologies.

- Seed script producing a full realistic dataset: a vault with inventory, live listings with competing
  offers, active loans at various maturities, one defaulted loan mid-liquidation, one completed cycle
- A demo runbook in `docs/DEMO.md` with the exact click path and expected screen at each step
- Empty states, loading skeletons, error copy for every error code
- Accessibility pass with axe green on primary routes
- The test clock endpoint wired to an admin control so a demo can jump a loan to maturity live
- Basic observability: structured logs, a health endpoint, request duration metrics

**Exit criteria:** a cold `pnpm db:seed && pnpm dev` reaches a demo-ready state in one command;
the full Playwright cross-app test passes; the demo runbook executes without deviation.

**The Web2 product is complete here.** Everything after this is the pivot.

---

## P9: chain readiness

**Goal:** prove the seam holds before writing any Move.

- Audit every domain file for infrastructure imports; the boundary lint must be clean
- Confirm every use case is exactly one `unitOfWork.run`
- Extract protocol parameters into a shape that maps to a Move `Config` struct
- Add `settlementDriver` and `custodyDriver` configuration switches
- Write the Sui adapters as stubs that throw, and confirm the application still boots and every
  ledger-driver test still passes
- Move fixtures for interest and waterfall into a shared JSON file that TypeScript tests read

**Exit criteria:** flipping the driver to `chain` produces a clean, obvious failure at the port
boundary and nowhere else. If it fails somewhere in a use case, the seam leaked; fix it here.

---

## P10: Move contracts

**Goal:** the same rules, enforced by the chain.

- Package modules: `config`, `custody`, `listing`, `loan`, `notes`, `liquidation`
- Move unit tests mirroring the domain test names one for one, reading the shared fixtures
- Localnet publish in CI
- `SuiSettlementAdapter` and `SuiCustodyAdapter` passing the same port contract suites
- Indexer: checkpoint or event stream, durable cursor, idempotent handlers, replay test
- Transaction builders in `apps/api/src/infrastructure/chain/ptb/`, pure functions, unit tested
  against expected command shapes

**Exit criteria:** the port contract suites pass against the Sui adapters; the indexer replay test
reconstructs identical state; the Move and TypeScript interest calculations agree on every shared
fixture.

---

## P11: cutover

**Goal:** run on chain without a big-bang risk.

- Shadow mode: chain adapter executes, ledger adapter also records, a job diffs the two and alerts
- Wallet authentication in the marketplace app alongside session auth
- Client-side signing: the API returns unsigned transaction bytes, the wallet signs, the client
  submits
- The `PENDING_CONFIRMATION` UI state becomes reachable
- Testnet deployment, then a limited mainnet pilot with capped exposure
- The reconciliation screen gains its third column: physical, database, chain

**Exit criteria:** shadow mode runs for a sustained period with zero unexplained diffs; a full
lifecycle completes on testnet with every settlement reference resolving on an explorer.

---

## Sequencing notes

- **P0.5 before any UI.** Tokens must exist before a component consumes them.
- **P1 before P2.** Money infrastructure first. Custody without a ledger to test against invites
  building the ledger to fit custody's assumptions.
- **P4 is the risk concentration.** Budget more time than it looks like it needs.
- **P7 is not optional polish.** Reconciliation and audit are what make the custody claim credible,
  and they are the first thing a serious lender or regulator asks about.
- **Do not start P10 before P9 is clean.** Writing Move against a leaky seam means writing the
  backend twice.
- If time is short, cut scope within a phase (fewer item categories, no bidding in liquidation),
  never cut a phase. A product missing P6 has no story for what happens when someone does not pay,
  which is the only question anyone will ask.
